import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
app.get("/", (req, res) => res.send("✅ BossTimer is running!"));
app.listen(PORT, () => console.log(`🌐 Serwer Express uruchomiony na porcie ${PORT}`));

// Konfiguracja
const BOSS_CHANNEL = "resp-boss";
const EVENT_CHANNEL = "eventy";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Ładowanie danych
let data = { bosses: [], events: {} };
const DATA_FILE = "./data.json";
if (fs.existsSync(DATA_FILE)) {
  data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// 🔹 Funkcje pomocnicze
const saveData = () => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

const parseTime = (input) => {
  const match = input.match(/\+((\d+)h)?((\d+)m)?/);
  if (!match) return null;
  const hours = parseInt(match[2] || 0);
  const minutes = parseInt(match[4] || 0);
  return (hours * 60 + minutes) * 60000;
};

const formatTime = (date) => {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
};

// 🔸 Boss Embedy
const bossEmbed = (boss) =>
  new EmbedBuilder()
    .setTitle(`💀 ${boss.name}`)
    .setDescription(`📍 **${boss.location}**\n⏰ Respawn: **${formatTime(boss.respawn)}**`)
    .setColor(0xff5555)
    .setFooter({ text: `Dodano przez ${boss.author}` });

// 🔸 Event Embedy
const eventEmbed = (eventName, times) =>
  new EmbedBuilder()
    .setTitle(`🎉 ${eventName}`)
    .setDescription(times.map((t) => `🕒 ${t}`).join("\n"))
    .setColor(0x55ff55)
    .setFooter({ text: "Cykliczne eventy MU Online" });

// 🔹 START BOTA
client.once("clientReady", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
  setInterval(checkBosses, 60 * 1000);
  setInterval(checkEvents, 60 * 1000);
});

// 🔹 Obsługa wiadomości
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const channelName = msg.channel.name;
  const [cmd, ...args] = msg.content.split(" ");

  // =====================
  // 💀 KOMENDY DLA BOSSÓW
  // =====================
  if (channelName === BOSS_CHANNEL) {
    if (cmd === "!boss") {
      const [name, location, timeArg] = args;
      if (!name || !location || !timeArg)
        return msg.reply("❌ Użycie: `!boss <nazwa> <lokacja> +czas` np. `!boss Kundun5 Kalima +2h10m`");

      const duration = parseTime(timeArg);
      if (!duration) return msg.reply("❌ Podaj czas w formacie `+Xm`, `+Xh`, lub `+XhYm`.");

      const respawn = new Date(Date.now() + duration);
      const boss = { name, location, respawn, author: msg.author.username };
      data.bosses.push(boss);
      saveData();

      await msg.channel.send({ embeds: [bossEmbed(boss)] });
    }

    if (cmd === "!timer") {
      if (!data.bosses.length) return msg.reply("⏳ Brak aktywnych bossów.");
      const embeds = data.bosses.map(bossEmbed);
      for (const e of embeds) await msg.channel.send({ embeds: [e] });
    }

    if (cmd === "!timerclean") {
      data.bosses = data.bosses.filter((b) => b.respawn > Date.now());
      saveData();
      msg.reply("🧹 Usunięto nieaktywne bossy!");
    }

    if (cmd === "!delboss") {
      const name = args[0];
      if (!name) return msg.reply("❌ Podaj nazwę bossa do usunięcia.");
      data.bosses = data.bosses.filter((b) => b.name.toLowerCase() !== name.toLowerCase());
      saveData();
      msg.reply(`🗑️ Usunięto bossa **${name}**.`);
    }
  }

  // =====================
  // 🎉 KOMENDY DLA EVENTÓW
  // =====================
  if (channelName === EVENT_CHANNEL) {
    if (cmd === "!event") {
      const [name, time] = [args[0], args[1]];
      if (!name || !time) return msg.reply("❌ Użycie: `!event <nazwa> HH;MM`");

      if (!data.events[name]) data.events[name] = [];
      if (!data.events[name].includes(time)) data.events[name].push(time);
      saveData();

      await msg.channel.send({ embeds: [eventEmbed(name, data.events[name])] });
    }

    if (cmd === "!delevent") {
      const [name, time] = [args[0], args[1]];
      if (!name || !time) return msg.reply("❌ Użycie: `!delevent <nazwa> HH;MM`");
      if (data.events[name]) {
        data.events[name] = data.events[name].filter((t) => t !== time);
        if (data.events[name].length === 0) delete data.events[name];
        saveData();
        msg.reply(`🗑️ Usunięto godzinę **${time}** dla eventu **${name}**.`);
      }
    }

    if (cmd === "!events") {
      if (Object.keys(data.events).length === 0) return msg.reply("📭 Brak zapisanych eventów.");
      for (const [name, times] of Object.entries(data.events)) {
        await msg.channel.send({ embeds: [eventEmbed(name, times)] });
      }
    }
  }
});

// 🔁 Sprawdzanie bossów
async function checkBosses() {
  const now = Date.now();
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find((ch) => ch.name === BOSS_CHANNEL);
  if (!channel) return;

  for (const boss of [...data.bosses]) {
    const timeLeft = boss.respawn - now;
    if (timeLeft <= 0) {
      await channel.send(`⚔️ **${boss.name}** (${boss.location}) właśnie się pojawił!`);
      data.bosses = data.bosses.filter((b) => b !== boss);
      saveData();
    } else if (Math.abs(timeLeft - 15 * 60000) < 60000) {
      await channel.send(`⏰ **${boss.name}** pojawi się za 15 minut (${boss.location})!`);
    }
  }
}

// 🔁 Sprawdzanie eventów
async function checkEvents() {
  const now = new Date();
  const current = `${now.getHours().toString().padStart(2, "0")};${now.getMinutes().toString().padStart(2, "0")}`;
  const reminder = `${now.getHours().toString().padStart(2, "0")};${(now.getMinutes() + 15)
    .toString()
    .padStart(2, "0")}`;

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find((ch) => ch.name === EVENT_CHANNEL);
  if (!channel) return;

  for (const [name, times] of Object.entries(data.events)) {
    for (const t of times) {
      if (t === reminder) await channel.send(`🔔 Za **15 minut** event **${name}**!`);
      if (t === current) await channel.send(`🎉 Event **${name}** właśnie się rozpoczął!`);
    }
  }
}

// 🔐 Logowanie
client.login(process.env.TOKEN);
