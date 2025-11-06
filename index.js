// ✅ BossTimer & Event Reminder Bot (finalna wersja by ChatGPT 2025)
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

// 🟢 Express serwer (utrzymanie przy życiu na Koyeb)
const app = express();
const PORT = process.env.PORT || 8000;
app.get("/", (req, res) => res.send("✅ BossTimer & Event Bot działa!"));
app.listen(PORT, () => console.log(`🌐 Serwer Express uruchomiony na porcie ${PORT}`));

// ⚙️ Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const BOSS_CHANNEL = "resp-boss";
const EVENT_CHANNEL = "eventy";

let bosses = [];
let events = {}; // { "Rabbit Invasion": ["15:23", "20:23"] }

// 🕒 Pomocnicze
const parseTime = (str) => {
  const [h, m] = str.split(":").map(Number);
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (date < now) date.setDate(date.getDate() + 1);
  return date;
};
const formatTime = (date) => date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", hour12: false });

// 🧹 Czyszczenie bossów co minutę
setInterval(() => {
  const now = Date.now();
  bosses = bosses.filter((b) => b.time > now);
}, 60 * 1000);

// 🔔 Przypomnienia eventów
setInterval(() => {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");

  for (const [name, times] of Object.entries(events)) {
    for (const t of times) {
      const [eh, em] = t.split(":").map(Number);
      const eventTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em, 0);
      const diff = (eventTime - now) / 60000;

      if (Math.abs(diff - 15) < 0.5) {
        const embed = new EmbedBuilder()
          .setTitle("🕒 EVENT ZA 15 MINUT!")
          .setDescription(`🌿 **${name}** o **${t}**`)
          .setColor("Green")
          .setTimestamp();

        const channel = client.channels.cache.find((ch) => ch.name === EVENT_CHANNEL);
        if (channel) channel.send({ embeds: [embed] });
      }
    }
  }
}, 60 * 1000);

// 💬 Obsługa komend
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const args = msg.content.split(" ");
  const cmd = args.shift().toLowerCase();

  // ------------------- 🧨 BOSSY -------------------
  if (msg.channel.name === BOSS_CHANNEL) {
    if (cmd === "!boss") {
      const name = args[0];
      const timeStr = args[1];
      if (!name || !timeStr) return msg.reply("❌ Użycie: `!boss <nazwa> <+minuty>`");

      const match = timeStr.match(/^\+(\d+)m$/);
      if (!match) return msg.reply("❌ Podaj czas w formacie `+Xm` np. `+15m`");
      const minutes = parseInt(match[1]);
      const time = Date.now() + minutes * 60000;

      bosses.push({ name, time });
      const embed = new EmbedBuilder()
        .setTitle("🔥 Dodano Bossa!")
        .setDescription(`**${name}** pojawi się za **${minutes}m** (${formatTime(new Date(time))})`)
        .setColor("Red")
        .setTimestamp();
      msg.channel.send({ embeds: [embed] });

      setTimeout(() => {
        const embed2 = new EmbedBuilder()
          .setTitle("⚔️ BOSS WSTAŁ!")
          .setDescription(`**${name}** właśnie się pojawił!`)
          .setColor("Orange");
        msg.channel.send({ embeds: [embed2] });
      }, minutes * 60000);

      if (minutes > 15) {
        setTimeout(() => {
          const embed3 = new EmbedBuilder()
            .setTitle("⏳ Przypomnienie!")
            .setDescription(`**${name}** pojawi się za 15 minut!`)
            .setColor("Yellow");
          msg.channel.send({ embeds: [embed3] });
        }, (minutes - 15) * 60000);
      }
    }

    if (cmd === "!delboss") {
      const name = args[0];
      bosses = bosses.filter((b) => b.name.toLowerCase() !== name.toLowerCase());
      msg.reply(`🗑️ Boss **${name}** usunięty.`);
    }

    if (cmd === "!timer") {
      if (bosses.length === 0) return msg.reply("Brak aktywnych bossów.");
      const lines = bosses.map((b) => {
        const diff = Math.max(0, Math.floor((b.time - Date.now()) / 60000));
        return `🔥 **${b.name}** – za ${diff}m (${formatTime(new Date(b.time))})`;
      });
      const embed = new EmbedBuilder().setTitle("🕒 Aktywne Bossy").setDescription(lines.join("\n")).setColor("Red");
      msg.channel.send({ embeds: [embed] });
    }

    if (cmd === "!timerclean") {
      const before = bosses.length;
      bosses = bosses.filter((b) => b.time > Date.now());
      const removed = before - bosses.length;
      msg.reply(`🧹 Usunięto ${removed} zakończonych bossów.`);
    }
  }

  // ------------------- 🌿 EVENTY -------------------
  if (msg.channel.name === EVENT_CHANNEL) {
    if (cmd === "!event") {
      const name = args.slice(0, -1).join(" ");
      const timeStr = args[args.length - 1];
      if (!name || !timeStr) return msg.reply("❌ Użycie: `!event <nazwa> <HH:MM>`");

      if (!events[name]) events[name] = [];
      if (!events[name].includes(timeStr)) events[name].push(timeStr);

      const embed = new EmbedBuilder()
        .setTitle("🌿 Dodano Event")
        .setDescription(`**${name}** o godzinie **${timeStr}**`)
        .setColor("Green")
        .setTimestamp();
      msg.channel.send({ embeds: [embed] });
    }

    if (cmd === "!delevent") {
      const name = args.slice(0, -1).join(" ");
      const timeStr = args[args.length - 1];
      if (events[name]) {
        events[name] = events[name].filter((t) => t !== timeStr);
        if (events[name].length === 0) delete events[name];
        msg.reply(`🗑️ Usunięto godzinę **${timeStr}** dla eventu **${name}**.`);
      } else msg.reply("❌ Nie znaleziono takiego eventu.");
    }

    if (cmd === "!listevent") {
      if (Object.keys(events).length === 0) return msg.reply("❌ Brak zapisanych eventów.");
      const lines = Object.entries(events).map(([n, t]) => `🌿 **${n}** → ${t.join(", ")}`);
      const embed = new EmbedBuilder().setTitle("📅 Zaplanowane Eventy").setDescription(lines.join("\n")).setColor("Green");
      msg.channel.send({ embeds: [embed] });
    }
  }
});

// 🚀 Start
client.once("clientReady", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

client.login(process.env.TOKEN);
