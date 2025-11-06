// Finalny index.js — BossTimer + EventTimer + AutoBackup + Guild Vault Reminder
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import cron from "node-cron";

dotenv.config();

// --- Express (health check dla Koyeb) ---
const app = express();
const PORT = process.env.PORT || 8000;
app.get("/", (req, res) => res.send("✅ BossTimer & Event Bot działa!"));
app.listen(PORT, () => console.log(`🌐 Express: port ${PORT}`));

// --- Kanały ---
const BOSS_CHANNEL = process.env.CHANNEL_RESP || "resp-boss";
const EVENT_CHANNEL = process.env.CHANNEL_EVENT || "eventy";
const GUILD_CHANNEL = "skarbowka-pierogow"; // 💰 przypomnienia do wpłaty

// --- Plik danych ---
const DATA_FILE = "./data.json";
let data = { bosses: [], events: {} };

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, "utf8");
      data = JSON.parse(content);
      console.log("[DATA] Wczytano dane z data.json");
    } catch (e) {
      console.error("[DATA ERROR] Nie można wczytać data.json:", e);
      data = { bosses: [], events: {} };
    }
  } else {
    console.warn("[DATA WARNING] Brak pliku data.json — pusty stan.");
  }
}
loadData();

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Błąd zapisu data.json:", e);
  }
}

// --- Pomocnicze funkcje czasu ---
function nowWarsaw() {
  return new Date(new Date().toLocaleString("en-GB", { timeZone: "Europe/Warsaw" }));
}
function formatHM(date) {
  return date.toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
}
function hhmmNow() {
  const d = nowWarsaw();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function normalizeTimeString(s) {
  if (!s) return null;
  return s.replace(";", ":");
}
function parseDurationToMs(input) {
  if (!input) return null;
  const match = input.match(/^\+((\d+)h)?((\d+)m)?$/i);
  if (!match) return null;
  const hours = parseInt(match[2] || "0", 10);
  const mins = parseInt(match[4] || "0", 10);
  return (hours * 60 + mins) * 60 * 1000;
}

// --- Discord client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// --- Sety do przypomnień ---
let sentBossReminder = new Set();
let sentBossSpawn = new Set();
let sentEventReminder = new Set();
let sentEventStart = new Set();

// === CHECK LOOP ===
async function checkLoop() {
  const now = nowWarsaw();
  const nowHHMM = hhmmNow();
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const bossChannel = guild.channels.cache.find((c) => c.name === BOSS_CHANNEL);
  const eventChannel = guild.channels.cache.find((c) => c.name === EVENT_CHANNEL);

  // Bossy
  data.bosses = data.bosses.filter((b) => {
    const respawn = new Date(b.respawn).getTime();
    const diffMs = respawn - now.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    // 15 min przed
    if (diffMin === 15) {
      const key = `${b.name.toLowerCase()}|${b.map}|rem`;
      if (!sentBossReminder.has(key)) {
        sentBossReminder.add(key);
        if (bossChannel) {
          bossChannel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("⏳ Przypomnienie: boss za 15 minut")
                .setDescription(`💀 **${b.name}** na **${b.map}** o ${formatHM(new Date(b.respawn))}`)
                .setColor(0xffd700)
                .setTimestamp(),
            ],
          });
        }
      }
    }

    // Wstał
    if (diffMs <= 0) {
      const key = `${b.name.toLowerCase()}|${b.map}|spawn`;
      if (!sentBossSpawn.has(key)) {
        sentBossSpawn.add(key);
        if (bossChannel) {
          bossChannel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("⚔️ BOSS WSTAŁ!")
                .setDescription(`🔥 **${b.name}** na **${b.map}** właśnie się pojawił!`)
                .setColor(0xff5500)
                .setTimestamp(),
            ],
          });
        }
      }
      return false;
    }

    return true;
  });
  save();

  // Eventy
  const dateKey = now.toISOString().slice(0, 10);
  for (const [ename, times] of Object.entries(data.events)) {
    for (const t of times) {
      const normalized = normalizeTimeString(t);
      const [eh, em] = normalized.split(":").map((x) => parseInt(x, 10));
      const target = new Date(now);
      target.setHours(eh, em, 0, 0);
      let diffMin = Math.floor((target.getTime() - now.getTime()) / 60000);
      if (diffMin < 0) diffMin += 24 * 60;

      if (diffMin === 15) {
        const key = `${ename}|${t}|rem`;
        if (!sentEventReminder.has(key)) {
          sentEventReminder.add(key);
          if (eventChannel)
            eventChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("⏳ Event za 15 minut!")
                  .setDescription(`🎯 **${ename}** o ${normalized}`)
                  .setColor(0x55ff55),
              ],
            });
        }
      }

      if (diffMin === 0) {
        const key = `${ename}|${t}|start`;
        if (!sentEventStart.has(key)) {
          sentEventStart.add(key);
          if (eventChannel)
            eventChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("🎉 Event rozpoczęty!")
                  .setDescription(`🎯 **${ename}** właśnie się rozpoczął o ${normalized}`)
                  .setColor(0x55ff55),
              ],
            });
        }
      }
    }
  }

  // Reset o północy
  if (now.getHours() === 0 && now.getMinutes() === 1) {
    sentBossReminder.clear();
    sentBossSpawn.clear();
    sentEventReminder.clear();
    sentEventStart.clear();
  }
}

// --- Raporty co 6h ---
async function reportLoop() {
  const now = nowWarsaw();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const reportTimes = ["06:00", "12:00", "18:00", "00:00"];
  if (!reportTimes.includes(hhmm)) return;
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const bossChannel = guild.channels.cache.find((c) => c.name === BOSS_CHANNEL);
  const eventChannel = guild.channels.cache.find((c) => c.name === EVENT_CHANNEL);

  if (bossChannel) {
    const activeBosses = data.bosses.filter((b) => new Date(b.respawn).getTime() > now.getTime());
    const embed = new EmbedBuilder()
      .setTitle("📊 Raport bossów (co 6h)")
      .setDescription(
        activeBosses.length
          ? activeBosses.map((b) => `💀 **${b.name}** (${b.map}) — ${formatHM(new Date(b.respawn))}`).join("\n")
          : "Brak aktywnych bossów."
      )
      .setColor(0xff4444);
    bossChannel.send({ embeds: [embed] });
  }

  if (eventChannel) {
    const embed = new EmbedBuilder()
      .setTitle("📅 Raport eventów (co 6h)")
      .setDescription(
        Object.keys(data.events).length
          ? Object.entries(data.events)
              .map(([n, times]) => `🎯 **${n}** — ${times.join(", ")}`)
              .join("\n")
          : "Brak zapisanych eventów."
      )
      .setColor(0x55ff55);
    eventChannel.send({ embeds: [embed] });
  }
}

// --- Pętle ---
setInterval(checkLoop, 60 * 1000);
setInterval(reportLoop, 60 * 1000);

// --- Guild Vault Reminder ---
cron.schedule("0 9,21 * * 0,1", async () => {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channel = guild.channels.cache.find((c) => c.name === GUILD_CHANNEL);
  if (channel) {
    await channel.send("💰 Proszę o wpłatę na Guild Vault!");
    console.log("[REMINDER] Wysłano przypomnienie do skarbowka-pierogow");
  }
});

// --- Połączenie z Discordem ---
client.once("ready", async () => {
  console.log(`[BOT] Połączono jako ${client.user.tag}`);
  // Przywróć dane z backupu
  const { restoreLatestBackup } = await import("./backup.js");
  await restoreLatestBackup();
  console.log("[BACKUP] Przywrócono dane (jeśli wymagane)");
});

client.login(process.env.TOKEN);

// --- Import systemu backupów ---
import("./backup.js")
  .then(() => console.log("[BACKUP] System automatycznych backupów uruchomiony ✅"))
  .catch((err) => console.error("[BACKUP ERROR]", err));
