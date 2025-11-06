import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, "backups");
const DATA_FILE = path.join(__dirname, "data.json");
const MAX_BACKUPS = 2;

// --- Utwórz folder backups ---
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR);
  console.log("[BACKUP] Utworzono folder backups/");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// === FUNKCJA TWORZĄCA BACKUP ===
async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `data_backup_${timestamp}.json`);

  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.warn(`[BACKUP WARNING] Brak pliku ${DATA_FILE}, tworzę pusty.`);
      fs.writeFileSync(DATA_FILE, "{}");
    }

    fs.copyFileSync(DATA_FILE, backupFile);
    console.log(`[BACKUP] Utworzono kopię: ${backupFile}`);

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("data_backup_"))
      .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtime - fs.statSync(path.join(BACKUP_DIR, a)).mtime);

    if (files.length > MAX_BACKUPS) {
      for (const f of files.slice(MAX_BACKUPS)) {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        console.log(`[BACKUP] Usunięto starą kopię: ${f}`);
      }
    }

    await sendBackupMessage(backupFile);
  } catch (err) {
    console.error("[BACKUP ERROR]", err);
  }
}

// === WYSYŁANIE WIADOMOŚCI NA DISCORD ===
async function sendBackupMessage(backupPath) {
  if (!client.isReady()) return;
  for (const [_, guild] of client.guilds.cache) {
    const logs = guild.channels.cache.find(c => c.name === "logs");
    const chat = guild.channels.cache.find(c => c.name === "guild-czat");
    const attachment = new AttachmentBuilder(backupPath);

    if (logs) await logs.send({ content: "💾 Nowy backup data.json", files: [attachment] });
    if (chat) await chat.send("💾 Backup został wykonany pomyślnie");
  }
}

// === AUTOMATYCZNE PRZYWRACANIE BACKUPU PO REDEPLOYU
