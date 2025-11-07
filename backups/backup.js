// ✅ backup.js — automatyczne backupy + przywracanie + przypomnienia o Guild Valut
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

// upewnij się, że katalog istnieje
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// lekki klient Discord używany do wysyłania wiadomości z backup.js
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// === FUNKCJA BACKUP ===
export async function createBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(BACKUP_DIR, `data_backup_${timestamp}.json`);

    if (!fs.existsSync(DATA_FILE)) {
      console.warn(`[BACKUP] Brak pliku ${DATA_FILE}, pomijam tworzenie kopii.`);
      return null;
    }

    fs.copyFileSync(DATA_FILE, backupFile);
    console.log(`[BACKUP] Utworzono kopię: ${backupFile}`);

    // usuń stare, zostaw MAX_BACKUPS
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("data_backup_"))
      .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs - fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs);

    if (files.length > MAX_BACKUPS) {
      for (const f of files.slice(MAX_BACKUPS)) {
        try {
          fs.unlinkSync(path.join(BACKUP_DIR, f));
          console.log(`[BACKUP] Usunięto starą kopię: ${f}`);
        } catch (e) {
          console.warn(`[BACKUP] Nie udało się usunąć ${f}:`, e);
        }
      }
    }

    // Wyślij wiadomości na serwer (logs + guild-czat)
    await sendBackupMessage(backupFile);
    return backupFile;
  } catch (err) {
    console.error("[BACKUP ERROR]", err);
    return null;
  }
}

// === WIADOMOŚĆ NA DISCORD ===
async function sendBackupMessage(backupPath) {
  try {
    if (!client.isReady()) return;
    for (const [_, guild] of client.guilds.cache) {
      const logs = guild.channels.cache.find((c) => c.name === "logs");
      const chat = guild.channels.cache.find((c) => c.name === "guild-czat");
      const attachment = new AttachmentBuilder(backupPath);
      if (logs) {
        try {
          await logs.send({ content: `💾 Nowy backup data.json (${path.basename(backupPath)})`, files: [attachment] });
        } catch (e) {
          console.warn("[BACKUP] Nie można wysłać pliku do #logs:", e.message || e);
        }
      }
      if (chat) {
        try {
          await chat.send("💾 Backup został wykonany pomyślnie ✅");
        } catch (e) {
          console.warn("[BACKUP] Nie można wysłać wiadomości do #guild-czat:", e.message || e);
        }
      }
    }
  } catch (err) {
    console.error("[DISCORD BACKUP MESSAGE ERROR]", err);
  }
}

// === PRZYWRACANIE NA START ===
export async function restoreLatestBackup() {
  try {
    // jeśli data.json istnieje i nie jest pusty/{} — nic nie robimy
    if (fs.existsSync(DATA_FILE)) {
      const c = fs.readFileSync(DATA_FILE, "utf8").trim();
      if (c && c !== "{}") {
        console.log("[RESTORE] Plik data.json istnieje i zawiera dane — pomijam przywracanie.");
        return false;
      }
    }

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("data_backup_"))
      .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs - fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs);

    if (!files.length) {
      console.log("[RESTORE] Brak dostępnych backupów do przywrócenia.");
      return false;
    }

    const latest = path.join(BACKUP_DIR, files[0]);
    fs.copyFileSync(latest, DATA_FILE);
    console.log(`[RESTORE] Przywrócono dane z: ${files[0]}`);
    return true;
  } catch (e) {
    console.error("[RESTORE ERROR]", e);
    return false;
  }
}

// === PRZYPOMNIENIE O GUILD VALUT ===
async function guildVaultReminder() {
  try {
    if (!client.isReady()) return;
    for (const [_, guild] of client.guilds.cache) {
      const vaultChannel = guild.channels.cache.find((c) => c.name === "skarbowka-pierogow");
      if (vaultChannel) {
        try {
          await vaultChannel.send("💰 Proszę o wpłatę na Guild Valut !");
          console.log("[REMINDER] Wysłano przypomnienie o Guild Valut.");
        } catch (e) {
          console.warn(`[REMINDER] Nie można wysłać przypomnienia w ${guild.name}:`, e.message || e);
        }
      } else {
        console.warn(`[REMINDER] Nie znaleziono kanału #skarbowka-pierogow w ${guild.name}`);
      }
    }
  } catch (e) {
    console.error("[REMINDER ERROR]", e);
  }
}

// === CRONY ===
// Backup co 12 godzin (00:00, 12:00)
cron.schedule("0 */12 * * *", () => {
  console.log("[CRON] Uruchamiam automatyczny backup (co 12h)...");
  createBackup();
});

// Guild Vault – niedziela i poniedziałek o 09:00 i 21:00 (cron oparty na serwerowym TZ)
cron.schedule("0 9 * * 0,1", guildVaultReminder); // 09:00 w niedz i pon
cron.schedule("0 21 * * 0,1", guildVaultReminder); // 21:00

// === START klienta (do wysyłania wiadomości z backup.js) ===
client.once("ready", async () => {
  console.log("[BOT] Backup client połączony, próbuję przywrócić backup i uruchomić zadania...");
  await restoreLatestBackup(); // przy starcie spróbuj przywrócić, jeśli brak danych
  // natychmiastowy backup po starcie — przydatne, żeby mieć świeżą kopię
  await createBackup();
});

client.on("error", (e) => console.error("[BACKUP CLIENT ERROR]", e));
client.on("warn", (w) => console.warn("[BACKUP CLIENT WARN]", w));

client.login(process.env.TOKEN).catch((e) => {
  console.error("[BACKUP] Nie udało się zalogować backup clientem:", e);
});
