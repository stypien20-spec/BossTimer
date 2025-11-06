// ✅ backup.js — automatyczne backupy + przywracanie + przypomnienia o Guild Valut

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, "backups");
const DATA_FILE = path.join(__dirname, "data.json");
const MAX_BACKUPS = 2;

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// === FUNKCJA BACKUP ===
async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `data_backup_${timestamp}.json`);

  if (!fs.existsSync(DATA_FILE)) {
    console.warn(`[BACKUP] Brak pliku ${DATA_FILE}, pomijam tworzenie kopii.`);
    return;
  }

  fs.copyFileSync(DATA_FILE, backupFile);
  console.log(`[BACKUP] Utworzono kopię: ${backupFile}`);

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("data_backup_"))
    .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtime - fs.statSync(path.join(BACKUP_DIR, a)).mtime);

  if (files.length > MAX_BACKUPS) {
    for (const f of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`[BACKUP] Usunięto starą kopię: ${f}`);
    }
  }

  await sendBackupMessage();
}

// === WIADOMOŚĆ NA DISCORD ===
async function sendBackupMessage() {
  if (!client.isReady()) return;
  for (const [_, guild] of client.guilds.cache) {
    const chat = guild.channels.cache.find(c => c.name === "guild-czat");
    if (chat) await chat.send("💾 Backup został wykonany pomyślnie");
  }
}

// === PRZYWRACANIE BACKUPU PRZY STARCIU ===
export async function restoreLatestBackup() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("data_backup_"))
    .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtime - fs.statSync(path.join(BACKUP_DIR, a)).mtime);

  if (!files.length) {
    console.log("[RESTORE] Brak dostępnych backupów do przywrócenia.");
    return;
  }

  const latest = path.join(BACKUP_DIR, files[0]);
  fs.copyFileSync(latest, DATA_FILE);
  console.log(`[RESTORE] Przywrócono dane z: ${files[0]}`);
}

// === PRZYPOMNIENIE O GUILD VALUT ===
async function guildVaultReminder() {
  if (!client.isReady()) return;
  for (const [_, guild] of client.guilds.cache) {
    const vaultChannel = guild.channels.cache.find(c => c.name === "skarbowka-piergow");
    if (vaultChannel) {
      await vaultChannel.send("💰 **Proszę o wpłacenie zen na Guild Valut !**");
      console.log("[REMINDER] Wysłano przypomnienie o Guild Valut.");
    } else {
      console.warn(`[REMINDER] Nie znaleziono kanału #skarbowka-piergow w ${guild.name}`);
    }
  }
}

// === CRONY ===
// Backup co 12 godzin
cron.schedule("0 */12 * * *", createBackup);

// Guild Vault – niedziela i poniedziałek o 09:00 i 21:00
cron.schedule("0 9 * * 0,1", guildVaultReminder);
cron.schedule("0 21 * * 0,1", guildVaultReminder);

// === START ===
client.once("ready", async () => {
  console.log("[BOT] Połączono z Discordem — przywracam backup i uruchamiam zadania...");
  await restoreLatestBackup(); // zawsze przywraca ostatni backup
  await createBackup(); // od razu po starcie też robi nowy
});

client.login(process.env.TOKEN);
