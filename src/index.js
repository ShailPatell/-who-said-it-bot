require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('./store');
const { runRound } = require('./round');
const { startDailyScheduler } = require('./daily');

const ROUND_MS = 30_000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Channels with a round currently running (one at a time per channel).
const activeChannels = new Set();

async function play(interaction) {
  // No channel given = pull from every channel in the server the bot can read.
  const onlyChannel = interaction.options.getChannel('channel');
  const me = interaction.guild.members.me;

  if (
    onlyChannel &&
    !onlyChannel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])
  ) {
    return interaction.reply({ content: `I can't read history in ${onlyChannel}. Give me View Channel + Read Message History there.`, ephemeral: true });
  }
  if (activeChannels.has(interaction.channelId)) {
    return interaction.reply({ content: 'A round is already running here. Finish that one first.', ephemeral: true });
  }

  const lockId = interaction.channelId;
  const release = () => activeChannels.delete(lockId);
  activeChannels.add(lockId);

  try {
    await interaction.deferReply();
    const result = await runRound({
      guild: interaction.guild,
      onlyChannel,
      roundMs: ROUND_MS,
      send: (payload) => interaction.editReply(payload),
      edit: (payload) => interaction.editReply(payload),
      release,
    });
    if (result.error) await interaction.editReply(result.message);
  } catch (err) {
    release();
    console.error(err);
    await interaction.editReply('Something broke while picking a message. Check my permissions and try again.').catch(() => {});
  }
}

async function leaderboard(interaction) {
  const rows = store.leaderboard(interaction.guildId).slice(0, 10);
  if (!rows.length) {
    return interaction.reply({ content: 'No scores yet. Run `/whosaidit play`.', ephemeral: true });
  }
  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((r, i) => {
    const acc = r.played ? Math.round((r.correct / r.played) * 100) : 0;
    return `${medals[i] ?? `**${i + 1}.**`} <@${r.id}> | **${r.points}** pts | ${acc}% accuracy | best streak ${r.bestStreak}`;
  });
  const embed = new EmbedBuilder().setTitle('Who Said It leaderboard').setDescription(lines.join('\n'));
  return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function stats(interaction) {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const s = store.get(interaction.guildId, user.id);
  if (!s) {
    return interaction.reply({ content: `${user.username} hasn't played yet.`, ephemeral: true });
  }
  const acc = s.played ? Math.round((s.correct / s.played) * 100) : 0;
  const embed = new EmbedBuilder()
    .setTitle(`${user.username}'s stats`)
    .addFields(
      { name: 'Points', value: String(s.points), inline: true },
      { name: 'Correct', value: `${s.correct}/${s.played} (${acc}%)`, inline: true },
      { name: 'Streak', value: `${s.streak} (best ${s.bestStreak})`, inline: true }
    );
  return interaction.reply({ embeds: [embed] });
}

// ---- Daily automated round ----
// Set DAILY_CHANNEL_ID to turn it on. Optional: DAILY_TIME (default 15:00),
// TIMEZONE (default America/New_York), DAILY_ROUND_MINUTES (default 60), DAILY_RUN_ON_START=true (testing).
async function postDaily() {
  const channelId = process.env.DAILY_CHANNEL_ID;
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || !channel.guild) {
    throw new Error(`DAILY_CHANNEL_ID ${channelId} isn't a server text channel I can see.`);
  }
  if (activeChannels.has(channel.id)) {
    console.log('[daily] skipped, a round is already running in that channel');
    return;
  }

  const minutes = Number(process.env.DAILY_ROUND_MINUTES) || 60;
  const lockId = channel.id;
  const release = () => activeChannels.delete(lockId);
  activeChannels.add(lockId);

  let posted;
  const result = await runRound({
    guild: channel.guild,
    onlyChannel: null,
    roundMs: minutes * 60_000,
    header: `☀️ **Daily Who Said It!** You have ${minutes} minutes to guess.`,
    send: async (payload) => (posted = await channel.send(payload)),
    edit: (payload) => posted.edit(payload),
    release,
  });
  if (result.error) console.log(`[daily] couldn't start a round: ${result.error}`);
  else console.log('[daily] round posted');
}

function startDaily() {
  if (!process.env.DAILY_CHANNEL_ID) {
    console.log('Daily round is off. Set DAILY_CHANNEL_ID to turn it on.');
    return;
  }
  const timezone = process.env.TIMEZONE || 'America/New_York';
  const time = process.env.DAILY_TIME || '15:00';

  try {
    startDailyScheduler({
      timezone,
      time,
      lastDate: store.getMeta('lastDaily'),
      markFired: (date) => store.setMeta('lastDaily', date),
      onFire: postDaily,
    });
    console.log(`Daily round scheduled for ${time} ${timezone}.`);
  } catch (err) {
    console.error('Could not start the daily round:', err.message);
    return;
  }

  if (String(process.env.DAILY_RUN_ON_START).toLowerCase() === 'true') {
    postDaily().catch((err) => console.error('Daily test failed:', err));
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'whosaidit') return;
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'This only works in a server.', ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'play') return await play(interaction);
    if (sub === 'leaderboard') return await leaderboard(interaction);
    if (sub === 'stats') return await stats(interaction);
  } catch (err) {
    console.error(err);
  }
});

client.once('clientReady', (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  startDaily();
});

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);