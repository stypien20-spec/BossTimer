// Finalny index.js — BossTimer + EventTimer
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// --- Express (health check dla Koyeb) ---
const app = express();
const PORT = process.env.PORT || 8000;
app.get("/", (req, res) => res.send("✅ BossTimer & Event Bot działa!"));
app.listen(PORT, () => console.log(`🌐 Express: port ${PORT}`));

// --- Konfiguracja kanałów (domyślnie nazwy które ustaliliśmy) ---
const BOSS_CHANNEL = process.env.CHANNEL_RESP || "resp-boss";
const EVENT_CHANNEL = process.env.CHANNEL_EVENT || "eventy";

// --- Plik danych (persist) ---
const DATA_FILE = "./data.json";
let data = { bosses: [], events: {} }; // events: { "Rabbit Invasion": ["11:23","18:43"] }
if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Nie można wczytać data.json, zaczynam z pustymi danymi.", e);
    data = { bosses: [], events: {} };
  }
}
const save = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Błąd zapisu data.json:", e);
  }
};

// --- Pomocnicze funkcje czasu (ustawione na Europe/Warsaw) ---
function nowWarsaw() {
  return new Date(new Date().toLocaleString("en-GB", { timeZone: "Europe/Warsaw" }));
}
function formatHM(date) {
  return date.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
}
function hhmmNow() {
  const d = nowWarsaw();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
// akceptujemy zarówno "HH:MM" jak i "HH;MM"
function normalizeTimeString(s) {
  if (!s) return null;
  return s.replace(";", ":");
}

// parse boss time +XhYm, +Xm, +Xh
function parseDurationToMs(input) {
  if (!input) return null;
  const match = input.match(/^\+((\d+)h)?((\d+)m)?$/i);
  if (!match) return null;
  const hours = parseInt(match[2] || "0", 10);
  const mins = parseInt(match[4] || "0", 10);
  return (hours * 60 + mins) * 60 * 1000;
}

// --- Emoji i kolory dla eventów (można rozbudować) ---
const EVENT_META = {
  "Rabbit Invasion": { emoji: "🐰", color: 0xffb6c1 },
  "Golden Invasion": { emoji: "💰", color: 0xffd700 },
  "Magic Treasure": { emoji: "✨", color: 0x9370db },
  "Kanturu Domination": { emoji: "⚔️", color: 0x1e90ff },
  "Great Golden Dragon Invasion": { emoji: "🐉", color: 0xff4500 },
  "Death King": { emoji: "💀", color: 0x696969 },
  "White Wizard": { emoji: "🧙‍♂️", color: 0xffffff },
};
const BOSS_COLOR = 0xff4444;
const BOSS_EMOJI = "💀";
const EVENT_DEFAULT_COLOR = 0x55ff55;
const EVENT_DEFAULT_EMOJI = "🎉";

// --- Discord client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// --- Avoid duplicate reminders within the same minute ---
// store keys for which we already sent a 15-min reminder or spawn notification for current day/minute
let sentBossReminder = new Set();
let sentBossSpawn = new Set();
let sentEventReminder = new Set();
let sentEventStart = new Set();

function keyForBossReminder(boss) {
  // unique by boss name + target minute (YYYY-MM-DD|HH:MM)
  const dt = new Date(boss.respawn).toLocaleString("sv", { timeZone: "Europe/Warsaw" }).slice(0, 16);
  return `bossRem|${boss.name.toLowerCase()}|${dt}`;
}
function keyForBossSpawn(boss) {
  const dt = new Date(boss.respawn).toLocaleString("sv", { timeZone: "Europe/Warsaw" }).slice(0, 16);
  return `bossSpawn|${boss.name.toLowerCase()}|${dt}`;
}
function keyForEventReminder(eventName, timeStr, dateKey) {
  return `eventRem|${eventName.toLowerCase()}|${timeStr}|${dateKey}`;
}
function keyForEventStart(eventName, timeStr, dateKey) {
  return `eventStart|${eventName.toLowerCase()}|${timeStr}|${dateKey}`;
}

// --- Embedy helper ---
function makeBossEmbed(boss) {
  const date = new Date(boss.respawn);
  return new EmbedBuilder()
    .setTitle(`${BOSS_EMOJI} ${boss.name}`)
    .setDescription(`📍 **Mapa:** ${boss.map}\n⏰ **Respawn:** ${formatHM(date)}\n👤 Dodany przez: ${boss.addedBy}`)
    .setColor(BOSS_COLOR)
    .setTimestamp();
}
function makeEventEmbed(name, times) {
  const meta = EVENT_META[name] || {};
  const emoji = meta.emoji || EVENT_DEFAULT_EMOJI;
  const color = meta.color || EVENT_DEFAULT_COLOR;
  return new EmbedBuilder()
    .setTitle(`${emoji} ${name}`)
    .setDescription(times.map((t) => `🕒 ${t}`).join("\n"))
    .setColor(color)
    .setTimestamp();
}

// --- Core checks (runs every minute) ---
async function checkLoop() {
  const now = nowWarsaw();
  const nowHHMM = hhmmNow();
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const bossChannel = guild.channels.cache.find((c) => c.name === BOSS_CHANNEL);
  const eventChannel = guild.channels.cache.find((c) => c.name === EVENT_CHANNEL);

  // --- Bosses: check reminder 15min before and spawn ---
  data.bosses = data.bosses.filter((b) => {
    const respawn = new Date(b.respawn).getTime();
    const diffMs = respawn - now.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    // reminder 15 min before
    if (diffMin === 15) {
      const k = keyForBossReminder(b);
      if (!sentBossReminder.has(k)) {
        sentBossReminder.add(k);
        if (bossChannel) bossChannel.send({ embeds: [new EmbedBuilder().setTitle("⏳ Przypomnienie: boss za 15 minut").setDescription(`💀 **${b.name}** na **${b.map}** o ${formatHM(new Date(b.respawn))}`).setColor(0xffd700).setTimestamp()] });
      }
    }

    // spawn (<= 0)
    if (diffMs <= 0) {
      const k2 = keyForBossSpawn(b);
      if (!sentBossSpawn.has(k2)) {
        sentBossSpawn.add(k2);
        if (bossChannel) bossChannel.send({ embeds: [new EmbedBuilder().setTitle("⚔️ BOSS WSTAŁ!").setDescription(`🔥 **${b.name}** na **${b.map}** właśnie się pojawił!`).setColor(0xff5500).setTimestamp()] });
      }
      // remove this boss (returned false from filter)
      return false;
    }

    // keep boss
    return true;
  });

  // if we removed any bosses, save
  save();

  // --- Events: check 15min reminders and start ---
  // Build today's date key to prevent duplicate sends across minutes
  const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  for (const [ename, times] of Object.entries(data.events)) {
    for (const t of times) {
      // normalize both "HH:MM" and "HH;MM"
      const normalized = normalizeTimeString(t);
      const [eh, em] = normalized.split(":").map((x) => parseInt(x, 10));
      if (Number.isNaN(eh) || Number.isNaN(em)) continue;

      // compute target datetime in Warsaw today
      const target = new Date(now);
      target.setHours(eh, em, 0, 0);

      // if target < now, it will be for next day — but reminders are daily, so compute diff accordingly
      let diffMin = Math.floor((target.getTime() - now.getTime()) / 60000);
      if (diffMin < -1440 / 2) {
        // unlikely, but skip
        diffMin += 24 * 60;
      }
      if (diffMin < 0) {
        // event time today already passed → consider next day's target
        diffMin += 24 * 60;
      }

      // 15-minute reminder
      if (diffMin === 15) {
        const key = keyForEventReminder(ename, normalized, dateKey);
        if (!sentEventReminder.has(key)) {
          sentEventReminder.add(key);
          if (eventChannel) {
            const meta = EVENT_META[ename] || {};
            const emoji = meta.emoji || EVENT_DEFAULT_EMOJI;
            const color = meta.color || EVENT_DEFAULT_COLOR;
            const emb = new EmbedBuilder()
              .setTitle(`${emoji} Event za 15 minut!`)
              .setDescription(`🎯 **${ename}** o ${normalized}`)
              .setColor(color)
              .setTimestamp();
            eventChannel.send({ embeds: [emb] });
          }
        }
      }

      // event start (0 minutes)
      if (diffMin === 0) {
        const key = keyForEventStart(ename, normalized, dateKey);
        if (!sentEventStart.has(key)) {
          sentEventStart.add(key);
          if (eventChannel) {
            const meta = EVENT_META[ename] || {};
            const emoji = meta.emoji || EVENT_DEFAULT_EMOJI;
            const color = meta.color || EVENT_DEFAULT_COLOR;
            const emb = new EmbedBuilder()
              .setTitle(`${emoji} Event rozpoczęty!`)
              .setDescription(`🎉 **${ename}** właśnie się rozpoczął o ${normalized}`)
              .setColor(color)
              .setTimestamp();
            eventChannel.send({ embeds: [emb] });
          }
        }
      }
    }
  }

  // --- Clean up old sent sets (to avoid memory leak) ---
  // remove reminders older than 2 days (safe)
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  // NB: our keys contain date strings; to keep code simple we occasionally clear sets completely at midnight
  const currentHH = now.getHours();
  if (currentHH === 0 && now.getMinutes() === 1) {
    // just after midnight clear per-day sent sets
    sentBossReminder.clear();
    sentBossSpawn.clear();
    sentEventReminder.clear();
    sentEventStart.clear();
  }
}

// --- Scheduled reports every 6 hours (06:00,12:00,18:00,00:00 Warsaw) ---
// We check every minute and send when time matches
let lastReportSentKey = null;
async function reportLoop() {
  const now = nowWarsaw();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const hhmm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const reportTimes = ["06:00", "12:00", "18:00", "00:00"];
  if (!reportTimes.includes(hhmm)) return;

  const dateKey = now.toISOString().slice(0, 16);
  if (lastReportSentKey === dateKey + "|" + hhmm) return; // already sent this exact report minute

  const guild = client.guilds.cache.first();
  if (!guild) return;

  // Boss report to resp-boss
  const bossChannel = guild.channels.cache.find((c) => c.name === BOSS_CHANNEL);
  if (bossChannel) {
    const activeBosses = data.bosses.filter((b) => new Date(b.respawn).getTime() > now.getTime());
    const embed = new EmbedBuilder()
      .setTitle("📊 Raport bossów (co 6h)")
      .setDescription(activeBosses.length ? activeBosses.map((b) => `💀 **${b.name}** (${b.map}) — ${formatHM(new Date(b.respawn))}`).join("\n") : "Brak aktywnych bossów.")
      .setColor(BOSS_COLOR)
      .setTimestamp();
    await bossChannel.send({ embeds: [embed] });
  }

  // Event report to eventy
  const eventChannel = guild.channels.cache.find((c) => c.name === EVENT_CHANNEL);
  if (eventChannel) {
    const embed = new EmbedBuilder()
      .setTitle("📅 Raport eventów (co 6h)")
      .setDescription(Object.keys(data.events).length ? Object.entries(data.events).map(([n, times]) => `🎯 **${n}** — ${times.join(", ")}`).join("\n") : "Brak zapisanych eventów.")
      .setColor(EVENT_DEFAULT_COLOR)
      .setTimestamp();
    await eventChannel.send({ embeds: [embed] });
  }

  lastReportSentKey = dateKey + "|" + hhmm;
}

// --- Command handling ---
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const channel = message.channel;
  const channelName = channel.name;
  const raw = message.content.trim();
  const parts = raw.split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  // ---- BOSS channel commands ----
  if (channelName === BOSS_CHANNEL) {
    if (command === "!boss") {
      // usage: !boss <name> <map> +1h30m or +30m
      const name = args[0];
      const map = args[1];
      const timeArg = args[2];
      if (!name || !map || !timeArg) return channel.send("❌ Użycie: `!boss <nazwa> <mapa> +1h30m`");

      const ms = parseDurationToMs(timeArg);
      if (!ms || ms <= 0) return channel.send("❌ Podaj czas w formacie `+Xm`, `+Xh` lub `+XhYm` (np. `+1h30m`, `+45m`).");

      const respawnDate = new Date(nowWarsaw().getTime() + ms);
      const boss = { name, map, respawn: respawnDate.toISOString(), addedBy: message.author.username };
      data.bosses.push(boss);
      save();

      await channel.send({ embeds: [makeBossEmbed(boss)] });
      return;
    }

    if (command === "!timer") {
      const active = data.bosses.filter((b) => new Date(b.respawn).getTime() > nowWarsaw().getTime());
      if (active.length === 0) return channel.send("⏳ Brak aktywnych bossów.");
      const embed = new EmbedBuilder().setTitle("🕒 Aktywne timery bossów").setColor(BOSS_COLOR).setTimestamp();
      active.forEach((b) => {
        const minsLeft = Math.max(0, Math.ceil((new Date(b.respawn).getTime() - nowWarsaw().getTime()) / 60000));
        embed.addFields({ name: `${BOSS_EMOJI} ${b.name} (${b.map})`, value: `⏰ ${formatHM(new Date(b.respawn))} — za ${minsLeft}m • 👤 ${b.addedBy}`, inline: false });
      });
      return channel.send({ embeds: [embed] });
    }

    if (command === "!delboss") {
      const name = args[0];
      if (!name) return channel.send("❌ Użycie: `!delboss <nazwa>`");
      const before = Object.assign([], data.bosses);
      data.bosses = data.bosses.filter((b) => b.name.toLowerCase() !== name.toLowerCase());
      save();
      const removed = before.length - data.bosses.length;
      return channel.send(`🗑️ Usunięto ${removed} bossów o nazwie **${name}**.`);
    }

    if (command === "!timerclean") {
      const before = data.bosses.length;
      data.bosses = data.bosses.filter((b) => new Date(b.respawn).getTime() > nowWarsaw().getTime());
      save();
      return channel.send(`🧹 Usunięto ${before - data.bosses.length} zakończonych bossów.`);
    }
  }

  // ---- EVENT channel commands ----
  if (channelName === EVENT_CHANNEL) {
    if (command === "!event") {
      // usage: !event <Event Name (may be multiword)> HH:MM  (we support both ":" and ";")
      if (args.length < 2) return channel.send("❌ Użycie: `!event <nazwa> <HH:MM>` (np. `!event Rabbit Invasion 15:23`)");

      const timeRaw = args[args.length - 1];
      const nameParts = args.slice(0, -1);
      const eventName = nameParts.join(" ");
      const normalized = normalizeTimeString(timeRaw);
      // validate time
      const tm = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
      if (!tm) return channel.send("❌ Niepoprawny format czasu. Użyj HH:MM (24h).");

      if (!data.events[eventName]) data.events[eventName] = [];
      if (!data.events[eventName].includes(normalized)) {
        data.events[eventName].push(normalized);
        save();
        const meta = EVENT_META[eventName] || {};
        const emb = new EmbedBuilder()
          .setTitle(`${meta.emoji || EVENT_DEFAULT_EMOJI} Dodano event`)
          .setDescription(`🎯 **${eventName}** o godzinie **${normalized}**`)
          .setColor(meta.color || EVENT_DEFAULT_COLOR)
          .setTimestamp();
        return channel.send({ embeds: [emb] });
      } else {
        return channel.send("ℹ️ Ta godzina już istnieje dla tego eventu.");
      }
    }

    if (command === "!delevent") {
      if (args.length < 1) return channel.send("❌ Użycie: `!delevent <nazwa> <HH:MM>` lub `!delevent <nazwa>` aby usunąć cały event");
      const timeRaw = args[args.length - 1];
      let eventName, timeStr;
      // if last arg looks like time => remove single hour, else remove whole event
      if (normalizeTimeString(timeRaw).match(/^([01]\d|2[0-3]):([0-5]\d)$/) && args.length >= 2) {
        timeStr = normalizeTimeString(timeRaw);
        eventName = args.slice(0, -1).join(" ");
      } else {
        eventName = args.join(" ");
      }

      const ev = data.events[eventName];
      if (!ev) return channel.send("❌ Nie znaleziono takiego eventu.");

      if (timeStr) {
        data.events[eventName] = ev.filter((t) => t !== timeStr);
        if (data.events[eventName].length === 0) delete data.events[eventName];
        save();
        return channel.send(`🗑️ Usunięto godzinę ${timeStr} dla **${eventName}**.`);
      } else {
        delete data.events[eventName];
        save();
        return channel.send(`🗑️ Usunięto event **${eventName}** (wszystkie godziny).`);
      }
    }

    if (command === "!eventlist" || command === "!listevent" || command === "!events") {
      if (Object.keys(data.events).length === 0) return channel.send("📭 Brak zapisanych eventów.");

      const embed = new EmbedBuilder().setTitle("📅 Zaplanowane eventy").setColor(EVENT_DEFAULT_COLOR).setTimestamp();
      for (const [name, times] of Object.entries(data.events)) {
        embed.addFields({ name: `${EVENT_META[name]?.emoji || EVENT_DEFAULT_EMOJI} ${name}`, value: times.join(", "), inline: false });
      }
      return channel.send({ embeds: [embed] });
    }
  }
});

// --- Start loops ---
client.on("ready", () => {
  console.log("Bot ready. Starting loops...");
  // 1-minute loop for reminders & cleanups
  setInterval(checkLoop, 60 * 1000);
  // minute loop for reports (reportLoop checks whether now matches 06:00/12:00/18:00/00:00)
  setInterval(reportLoop, 60 * 1000);
});

// --- Login ---
client.login(process.env.TOKEN).catch((err) => {
  console.error("Błąd logowania (TOKEN?):", err);
});
