import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';

dotenv.config();

// ESM fix dla __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, 'backups');
const TIMERS_FILE = path.join(__dirname, 'timers.json');
const MAX_BACKUPS = 2;

// Inicjalizacja bota Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Tworzymy folder backups jeśli go nie ma
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR);
}

// === FUNKCJA TWORZĄCA BACKUP ===
async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `timers_backup_${timestamp}.json`);

  try {
    // Skopiuj timers.json
    fs.copyFileSync(TIMERS_FILE, backupFile);
    console.log(`[BACKUP] Utworzono kopię: ${backupFile}`);

    // Usuń stare kopie
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('timers_backup_'))
      .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtime - fs.statSync(path.join(BACKUP_DIR, a)).mtime);

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
        console.log(`[BACKUP] Usunięto starą kopię: ${file}`);
      }
    }

    // Wyślij info i plik na Discorda
    await sendBackupMessage(timestamp, backupFile);

  } catch (err) {
    console.error('[BACKUP ERROR]', err);
  }
}

// === WYSYŁANIE WIADOMOŚCI NA DISCORD ===
async function sendBackupMessage(timestamp, backupPath) {
  try {
    // Poczekaj aż bot będzie gotowy
    if (!client.isReady()) return;

    const guilds = client.guilds.cache;

    for (const [guildId, guild] of guilds) {
      const logsChannel = guild.channels.cache.find(ch => ch.name === 'logs');
      const infoChannel = guild.channels.cache.find(ch => ch.name === 'guild-chat');

      const attachment = new AttachmentBuilder(backupPath);

      if (logsChannel) {
        await logsChannel.send({
          content: `💾 Nowy backup timers.json (${timestamp})`,
          files: [attachment]
        });
      }

      if (infoChannel) {
        await infoChannel.send(`✅ Backup timers.json został pomyślnie utworzony o **${timestamp}**`);
      }
    }

  } catch (e) {
    console.error('[DISCORD BACKUP MESSAGE ERROR]', e);
  }
}

// === CRON: automatyczny backup 2x dziennie ===
// 0 0,12 * * * -> północ i południe
cron.schedule('0 0,12 * * *', () => {
  console.log('[CRON] Uruchamiam automatyczny backup...');
  createBackup();
});

// === Pierwszy backup po starcie ===
client.once('ready', () => {
  console.log('[BOT] Połączono, uruchamiam automatyczne backupy...');
  createBackup();
});

client.login(process.env.TOKEN);
