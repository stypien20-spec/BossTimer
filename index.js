// index.js
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const TOKEN = process.env.TOKEN;
const CHANNEL_NAME = process.env.CHANNEL_NAME || "resp-boss";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const app = express();
const PORT = process.env.PORT || 8000;
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, () => console.log(`🌐 HTTP server running on port ${PORT}`));

let bosses = [];

client.on("clientReady", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const channel = message.guild.channels.cache.find((ch) => ch.name === CHANNEL_NAME);
  if (!channel) {
    return message.reply(`❌ Nie znaleziono kanału #${CHANNEL_NAME}`);
  }

  if (command === "boss") {
    const [name, map, timeArg] = args;
    if (!name || !map || !timeArg)
      return message.reply("❌ Użycie: `!boss <nazwa> <mapa> +1h20m`");

    const match = timeArg.match(/\+?((\d+)h)?((\d+)m)?/);
    if (!match) return message.reply("❌ Niepoprawny format czasu, np. +1h30m");

    const hours = parseInt(match[2] || 0);
    const minutes = parseInt(match[4] || 0);
    const totalMs = (hours * 60 + minutes) * 60 * 1000;
    const respTime = Date.now() + totalMs;

    const boss = { name, map, respTime };
    bosses.push(boss);

    channel.send(`✅ **${name}** (${map}) respawn za ${hours}h ${minutes}m`);
    scheduleReminder(boss, channel);
  }

  if (command === "timer") {
    if (bosses.length === 0) return channel.send("⏳ Brak aktywnych bossów.");
    const list = bosses
      .map((b) => {
        const remaining = b.respTime - Date.now();
        const min = Math.max(0, Math.floor(remaining / 60000));
        return `🕒 **${b.name}** (${b.map}) - za ${Math.floor(min / 60)}h ${min % 60}m`;
      })
      .join("\n");
    channel.send(list);
  }

  if (command === "delboss") {
    const name = args[0];
    if (!name) return message.reply("❌ Użycie: `!delboss <nazwa>`");
    const before = bosses.length;
    bosses = bosses.filter((b) => b.name.toLowerCase() !== name.toLowerCase());
    if (bosses.length === before) return message.reply("❌ Nie znaleziono takiego bossa.");
    channel.send(`🗑️ Usunięto bossa **${name}**`);
  }

  if (command === "timerclean") {
    bosses = [];
    channel.send("🧹 Wszystkie timery wyczyszczone.");
  }
});

function scheduleReminder(boss, channel) {
  const reminderTime = boss.respTime - 15 * 60 * 1000;
  const delay = reminderTime - Date.now();

  if (delay > 0) {
    setTimeout(() => {
      channel.send(`⚠️ **${boss.name}** (${boss.map}) respawn za 15 minut!`);
    }, delay);
  }

  const totalDelay = boss.respTime - Date.now();
  setTimeout(() => {
    channel.send(`🔥 **${boss.name}** (${boss.map}) właśnie się pojawił!`);
    bosses = bosses.filter((b) => b.name !== boss.name);
  }, totalDelay);
}

client.login(TOKEN);
