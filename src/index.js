require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SnowflakeUtil,
  PermissionFlagsBits,
} = require('discord.js');
const store = require('./store');

const ROUND_MS = 30_000;
const MIN_LEN = 20;
const MAX_LEN = 300;
const MAX_OPTIONS = 5;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const activeChannels = new Set();

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const nameOf = (msg) => msg.member?.displayName ?? msg.author.globalName ?? msg.author.username;

function isGood(msg) {
  if (msg.author.bot || msg.system || !msg.content) return false;
  const len = msg.content.length;
  if (len < MIN_LEN || len > MAX_LEN) return false;
  if (/https?:\/\//i.test(msg.content)) return false;
  if (msg.mentions.users.size > 0 || msg.mentions.everyone) return false;
  if (msg.content.startsWith('/') || msg.content.startsWith('!')) return false;
  return true;
}

// Samples random points in the channel's history until it finds a good message.
async function pickRound(channel) {
  const created = SnowflakeUtil.timestampFrom(channel.id);
  const pool = new Map(); // authorId -> display name
  let chosen = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const ts = created + Math.floor(Math.random() * (Date.now() - created));
    const before = SnowflakeUtil.generate({ timestamp: ts }).toString();
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) continue;

    for (const m of batch.values()) {
      if (!m.author.bot && !m.system) pool.set(m.author.id, nameOf(m));
    }

    if (!chosen) {
      const good = [...batch.values()].filter(isGood);
      if (good.length) chosen = good[Math.floor(Math.random() * good.length)];
    }
    if (chosen && pool.size >= 3) break;
  }

  if (!chosen || pool.size < 3) return null;

  pool.set(chosen.author.id, nameOf(chosen));
  const others = shuffle([...pool.entries()].filter(([id]) => id !== chosen.author.id)).slice(0, MAX_OPTIONS - 1);
  const options = shuffle([[chosen.author.id, nameOf(chosen)], ...others]).map(([id, name]) => ({ id, name }));
  return { message: chosen, options };
}

function buttonsFor(options, disabled = false, correctId = null) {
  const row = new ActionRowBuilder();
  for (const o of options) {
    const btn = new ButtonBuilder()
      .setCustomId(`guess:${o.id}`)
      .setLabel(o.name.slice(0, 80))
      .setDisabled(disabled)
      .setStyle(correctId ? (o.id === correctId ? ButtonStyle.Success : ButtonStyle.Secondary) : ButtonStyle.Primary);
    row.addComponents(btn);
  }
  return row;
}

async function play(interaction) {
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const me = interaction.guild.members.me;

  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
    return interaction.reply({ content: `I can't read history in ${channel}. Give me View Channel + Read Message History there.`, ephemeral: true });
  }
  if (activeChannels.has(interaction.channelId)) {
    return interaction.reply({ content: 'A round is already running here. Finish that one first.', ephemeral: true });
  }

  activeChannels.add(interaction.channelId);
  await interaction.deferReply();

  try {
    const round = await pickRound(channel);
    if (!round) {
      return interaction.editReply('Couldn\'t find a good message with enough different people. Try a busier channel.');
    }

    const { message: target, options } = round;
    const endsAt = Math.floor((Date.now() + ROUND_MS) / 1000);
    const embed = new EmbedBuilder()
      .setTitle('Who said it?')
      .setDescription(`>>> ${target.content}`)
      .setFooter({ text: 'One guess each. The author sits this one out.' })
      .addFields({ name: 'Time is up', value: `<t:${endsAt}:R>` });

    const sent = await interaction.editReply({
      embeds: [embed],
      components: [buttonsFor(options)],
      allowedMentions: { parse: [] },
    });

    const guesses = new Map(); // userId -> guessed authorId
    const collector = sent.createMessageComponentCollector({ time: ROUND_MS });

    collector.on('collect', async (i) => {
      if (i.user.id === target.author.id) {
        return i.reply({ content: 'You wrote this one. Sit this round out and let them squirm.', ephemeral: true });
      }
      if (guesses.has(i.user.id)) {
        return i.reply({ content: 'You already locked in a guess.', ephemeral: true });
      }
      guesses.set(i.user.id, i.customId.split(':')[1]);
      return i.reply({ content: 'Locked in. No take-backs.', ephemeral: true });
    });

    collector.on('end', async () => {
      try {
        const correctId = target.author.id;
        const winners = [];
        const losers = [];
        let first = true;
        for (const [userId, guess] of guesses) {
          if (guess === correctId) {
            const pts = first ? 2 : 1; // first correct guess gets a bonus point
            first = false;
            store.record(interaction.guildId, userId, true, pts);
            winners.push(`<@${userId}> (+${pts})`);
          } else {
            store.record(interaction.guildId, userId, false, 0);
            losers.push(`<@${userId}>`);
          }
        }

        const reveal = new EmbedBuilder()
          .setTitle('Who said it?')
          .setDescription(`>>> ${target.content}`)
          .addFields(
            { name: 'Answer', value: `<@${correctId}> in ${target.channel}, <t:${Math.floor(target.createdTimestamp / 1000)}:D>\n[Jump to message](${target.url})` },
            { name: 'Got it', value: winners.join('\n') || 'Nobody. Embarrassing.', inline: true },
            { name: 'Missed', value: losers.join('\n') || 'No misses', inline: true }
          );

        await interaction.editReply({
          embeds: [reveal],
          components: [buttonsFor(options, true, correctId)],
          allowedMentions: { parse: [] },
        });
      } catch (err) {
        console.error('Failed to reveal round:', err);
      } finally {
        activeChannels.delete(interaction.channelId);
      }
    });
  } catch (err) {
    activeChannels.delete(interaction.channelId);
    console.error(err);
    await interaction.editReply('Something broke while picking a message. Check my permissions and try again.');
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

client.once('clientReady', (c) => console.log(`Logged in as ${c.user.tag}`));

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
