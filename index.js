const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let bosses = {};

client.once('ready', () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
  client.user.setActivity('Boss Timer ⏳');
});

// Pomocnicza funkcja do przeliczenia formatu +1h26m na milisekundy
function parseTime(str) {
  const match = str.match(/\+?((\d+)h)?((\d+)m)?/i);
  if (!match) return null;

  const hours = match[2] ? parseInt(match[2]) : 0;
  const minutes = match[4] ? parseInt(match[4]) : 0;

  return (hours * 60 + minutes) * 60 * 1000;
}

// Co minutę sprawdzaj, czy boss się zaraz pojawi
setInterval(() => {
  const now = Date.now();
  for (const [name, boss] of Object.entries(bosses)) {
    const diff = boss.time - now;

    // Przypomnienie 15 minut wcześniej
    if (!boss.reminded && diff <= 15 * 60 * 1000 && diff > 14 * 60 * 1000) {
      boss.channel.send(`⚠️ **${name.toUpperCase()}** na mapie **${boss.map}** pojawi się za **15 minut!**`);
      boss.reminded = true;
    }

    // Usunięcie po pojawieniu
    if (diff <= 0) {
      boss.channel.send(`🔥 **${name.toUpperCase()}** pojawił się na mapie **${boss.map}**!`);
      delete bosses[name];
    }
  }
}, 60 * 1000);

// Obsługa komend
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // !boss [nazwa] [mapa] [+1h26m]
  if (command === '!boss') {
    if (args.length < 3) return message.reply('⚠️ Użycie: `!boss [nazwa] [mapa] [+1h26m / +30m / +2h]`');
    const [name, map, timeStr] = args;
    const ms = parseTime(timeStr);

    if (!ms) return message.reply('⚠️ Niepoprawny format czasu! Użyj np. `+1h30m`, `+45m`, `+2h`.');

    const respTime = Date.now() + ms;
    bosses[name.toLowerCase()] = { time: respTime, map, reminded: false, channel: message.channel };

    message.channel.send(`✅ Ustawiono timer: **${name}** (${map}) za **${timeStr.replace('+','')}**.`);
  }

  // !delboss [nazwa]
  else if (command === '!delboss') {
    if (args.length < 1) return message.reply('⚠️ Użycie: `!delboss [nazwa]`');
    const name = args[0].toLowerCase();

    if (bosses[name]) {
      delete bosses[name];
      message.reply(`🗑️ Timer dla **${name}** został usunięty.`);
    } else {
      message.reply(`❌ Nie znaleziono timera dla **${name}**.`);
    }
  }

  // !timer — lista wszystkich bossów
  else if (command === '!timer') {
    if (Object.keys(bosses).length === 0) return message.reply('📭 Brak aktywnych timerów.');

    let reply = '📜 **Aktywne timery bossów:**\n';
    for (const [name, boss] of Object.entries(bosses)) {
      const remaining = Math.max(0, boss.time - Date.now());
      const h = Math.floor(remaining / 3600000);
      const m = Math.ceil((remaining % 3600000) / 60000);
      reply += `🕒 ${name} (${boss.map}) — ${h}h ${m}m\n`;
    }

    message.channel.send(reply);
  }

  // !timerclean — usuwa wszystkie timery
  else if (command === '!timerclean') {
    bosses = {};
    message.reply('🧹 Wszystkie timery zostały usunięte.');
  }
});

client.login(process.env.TOKEN);
