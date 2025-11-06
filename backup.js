import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';

dotenv.config();

// Fix dla __dirname w ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, 'backups');
const DATA_FILE = path.join(__dirname, 'data.json');
const MAX_BACKUPS = 2;

// Inicjalizacja bota Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Utwórz folder backups, jeśli nie istnieje
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR);
  console.log('[BACKUP] Utworzono folder backups/');
}

console.log('[BACKUP] System automatycznych backupów został uruchomiony ✅');

// === FUNKCJA TWORZĄCA BACKUP ===
async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `data_backup_${timestamp}.json`);

  try {
    // 🔒 Upewnij się, że plik data.json istnieje
    if (!fs.existsSync(DATA_FILE)) {
      console.warn(`[BACKUP WARNING] Plik ${DATA_FILE} nie istnieje — tworzę pusty plik.`);
      fs.writeFileSync(DATA_FILE, '{}');
    }

    // Skopiuj data.json do backups
    fs.copyFileSync(DATA_FILE, backupFile);
    console.log(`[BACKUP] Utworzono kopię: ${backupFile}`);

    // Usuń stare kopie — zostaw tylko 2 najnowsze
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('data_backup_'))
      .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtime - fs.statSync(path.join(BACKUP_DIR, a)).mtime);

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
        console.log(`[BACKUP] Usunięto starą kopię: ${file}`);
      }
    }

    // Wyślij backup i wiadomość na Discorda
    await sendBackupMessage(backupFile);

  } catch (err) {
    console.error('[BACKUP ERROR]', err);
  }
}

// === WYSYŁANIE WIADOMOŚCI NA DISCORD ===
async function sendBackupMessage(backupPath) {
  try {
    if (!client.isReady()) return;

    for (const [_, guild] of client.guilds.cache) {
      const logsChannel = guild.channels.cache.find(ch => ch.name === 'logs');
      const infoChannel = guild.channels.cache.find(ch => ch.name === 'guild-chat');
      const attachment = new AttachmentBuilder(backupPath);

      if (logsChannel) {
        await logsChannel.send({
          content: '💾 Nowy backup data.json',
          files: [attachment]
        });
      }

      if (infoChannel) {
        await infoChannel.send('💾 Backup został wykonany pomyślnie');
      }
    }

  } catch (err) {
    console.error('[DISCORD BACKUP MESSAGE ERROR]', err);
  }
}

// === CRON: automatyczny backup co 12 godzin ===
cron.schedule('0 */12 * * *', () => {
  console.log('[CRON] Uruchamiam automatyczny backup...');
  createBackup();
});

// === Pierwszy backup po starcie ===
client.once('ready', () => {
  console.log('[BOT] Połączono, uruchamiam automatyczne backupy...');
  createBackup();
});

client.login(process.env.TOKEN);
