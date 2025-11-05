import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import express from "express";

dotenv.config();
const app = express();
app.get("/", (req, res) => res.send("Bot działa i jest online!"));
app.listen(8000, () => console.log("🌐 Serwer Express uruchomiony na porcie 8000"));

// Discord konfiguracja
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const TOKEN = process.env.TOKEN;
const CHANNEL_NAME = process.env.CHANNEL_NAME || "resp-boss";

const bossTimers = new Map();

// funkcja do wysyłania przypomnień
function scheduleReminder(bossName, map, time) {
  const diff = time - Date.now();
  if (diff > 15 * 60 * 1000) {
    setTimeout(() => {
      const channel = client.channels.cache.find(c => c.name === CHANNEL_NAME);
      if (channel) channel.send(`⏰ **${bossName}** na mapie **${map}** pojawi się za 15 minut!`);
    }, diff - 15 * 60 * 1000);
  }
}

client.on("clientReady", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === "!boss") {
    const [name, map, czas] = args;
    if (!name || !map || !czas) {
      return message.reply("Użycie: `!boss <nazwa> <mapa> <+czas>` np. `!boss Kundun Aida +1h30m`");
    }

    const match = czas.match(/\+?(?:(\d+)h)?(?:(\d+)m)?/);
    if (!match) return message.reply("Niepoprawny format czasu! Użyj np. `+1h30m`, `+40m` lub `+2h`");

    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const respTime = Date.now() + (hours * 60 + minutes) * 60 * 1000;

    bossTimers.set(name.toLowerCase(), { name, map, respTime });
    scheduleReminder(name, map, respTime);

    const date = new Date(respTime).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    message.channel.send(`✅ Dodano bossa **${name}** (${map}) — resp o **${date}**.`);
  }

  else if (command === "!delboss") {
    const name = args[0];
    if (!name) return message.reply("Użycie: `!delboss <nazwa>`");

    if (bossTimers.delete(name.toLowerCase())) {
      message.reply(`❌ Boss **${name}** został usunięty z listy.`);
    } else {
      message.reply(`Nie znaleziono bossa o nazwie **${name}**.`);
    }
  }

  else if (command === "!timer") {
    if (bossTimers.size === 0) return message.reply("Brak aktywnych timerów bossów.");

    const list = [...bossTimers.values()]
      .map(b => {
        const timeLeft = Math.max(0, b.respTime - Date.now());
        const min = Math.floor(timeLeft / 60000);
        const hr = Math.floor(min / 60);
        const left = hr > 0 ? `${hr}h ${min % 60}m` : `${min}m`;
        const date = new Date(b.respTime).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        return `🕐 **${b.name}** (${b.map}) — resp za ${left} (${date})`;
      })
      .join("\n");

    message.channel.send(`📜 **Aktywne timery:**\n${list}`);
  }

  else if (command === "!timerclean") {
    bossTimers.clear();
    message.reply("🧹 Wszystkie timery bossów zostały wyczyszczone.");
  }
});

client.login(TOKEN);
