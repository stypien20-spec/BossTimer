// ✅ TimerBoss v2 — pełny index.js (bossy, eventy, backup, przypomnienia)

import fs from "fs";
import path from "path";
import express from "express";
import cron from "node-cron";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

// === Ścieżki i stałe ===
const DATA_FILE = path.join(process.cwd(), "data.json");
const BACKUP_DIR = path.join(process.cwd(), "backups");
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// === Pomocnicze ===
const readData = () => {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE);
      return JSON.parse(raw);
    } catch {
      console.error("[DATA ERROR] Nie można odczytać data.json — uszkodzony plik?");
      return { bosses: [], events: {} };
    }
  } else {
    console.warn("[DATA WARNING] Brak pliku data.json — pusty stan.");
    return { bosses: [], events: {} };
  }
};
const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// === Backup system ===
const createBackup = () => {
  if (!fs.existsSync(DATA_FILE)) return console.log("[BACKUP] Brak pliku data.json, pomijam.");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `data_backup_${timestamp}.json`);
  fs.copyFileSync(DATA_FILE, backupPath);
  console.log(`[BACKUP] Utworzono kopię: ${backupPath}`);
};

const restoreLatestBackup = () => {
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith("data_backup_"));
  if (!files.length) return console.log("[RESTORE] Brak dostępnych backupów.");
  files.sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtime - fs.statSync(path.join(BACKUP_DIR, a)).mtime);
  const latest = path.join(BACKUP_DIR, files[0]);
  fs.copyFileSync(latest, DATA_FILE);
  console.log(`[RESTORE] Przywrócono dane z: ${files[0]}`);
};

// === Discord client ===
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const app = express();
app.get("/", (req, res) => res.send("TimerBoss działa!"));
app.listen(8000, () => console.log("🌐 Express: port 8000"));

let data = readData();

// === Funkcje ===
function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function sendEmbed(channel, title, description, color) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
  channel.send({ embeds: [embed] });
}

// === Komendy ===
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const args = msg.content.trim().split(" ");
  const cmd = args.shift()?.toLowerCase();

  // !boss <nazwa> <mapa> <minuty>
  if (cmd === "!boss") {
    const [name, map, minutes] = args;
    if (!name || !map || isNaN(minutes)) return msg.reply("❌ Użycie: `!boss <nazwa> <mapa> <minuty>`");
    const respawn = new Date(Date.now() + minutes * 60000);
    data.bosses.push({ name, map, respawn, addedBy: msg.author.username });
    saveData(data);
    sendEmbed(msg.channel, "🐉 Nowy Boss", `**${name}** (${map}) pojawi się za ${minutes} minut.`, 0x00ff99);
  }

  // !delboss <nazwa>
  else if (cmd === "!delboss") {
    const name = args[0];
    const before = data.bosses.length;
    data.bosses = data.bosses.filter(b => b.name.toLowerCase() !== name?.toLowerCase());
    saveData(data);
    msg.reply(before !== data.bosses.length ? `🗑️ Boss **${name}** został usunięty.` : `❌ Nie znaleziono bossa **${name}**.`);
  }

  // !timer — lista bossów
  else if (cmd === "!timer") {
    if (!data.bosses.length) return msg.reply("Brak aktywnych bossów.");
    const desc = data.bosses.map(b => `🐲 **${b.name}** (${b.map}) — resp za ${formatTime(new Date(b.respawn) - Date.now())}`).join("\n");
    sendEmbed(msg.channel, "⏱️ Timery Bossów", desc, 0xffcc00);
  }

  // !event <nazwa> <HH:MM>
  else if (cmd === "!event") {
    const [name, time] = args;
    if (!name || !time) return msg.reply("❌ Użycie: `!event <nazwa> <HH:MM>`");
    if (!data.events[name]) data.events[name] = [];
    data.events[name].push(time);
    saveData(data);
    msg.reply(`📅 Dodano event **${name}** o ${time}.`);
  }

  // !delevent <nazwa>
  else if (cmd === "!delevent") {
    const name = args[0];
    if (!name || !data.events[name]) return msg.reply("❌ Nie znaleziono takiego eventu.");
    delete data.events[name];
    saveData(data);
    msg.reply(`🗑️ Event **${name}** został usunięty.`);
  }

  // !eventlist
  else if (cmd === "!eventlist") {
    if (!Object.keys(data.events).length) return msg.reply("Brak zapisanych eventów.");
    const desc = Object.entries(data.events).map(([name, times]) => `🎯 **${name}** — ${times.join(", ")}`).join("\n");
    sendEmbed(msg.channel, "📅 Lista Eventów", desc, 0x66ccff);
  }
});

// === Crony ===
cron.schedule("0 */12 * * *", createBackup); // backup co 12h

cron.schedule("0 9 * * 0,1", () => guildVaultReminder());
cron.schedule("0 21 * * 0,1", () => guildVaultReminder());

async function guildVaultReminder() {
  for (const [_, guild] of client.guilds.cache) {
    const ch = guild.channels.cache.find(c => c.name === "skarbowka-piergow");
    if (ch) await ch.send("💰 **Proszę o wpłacenie zen na Guild Valut !**");
  }
  console.log("[REMINDER] Guild Valut przypomnienie wysłane.");
}

// === Uruchomienie ===
client.once("ready", async () => {
  console.log(`[BOT] Połączono jako ${client.user.tag}`);
  restoreLatestBackup();
  createBackup();
  console.log("[BACKUP] System automatycznych backupów uruchomiony ✅");
});

client.login(process.env.TOKEN);
