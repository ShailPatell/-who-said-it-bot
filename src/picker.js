const { SnowflakeUtil, PermissionFlagsBits, ChannelType } = require('discord.js');

const MIN_LEN = 20;
const MAX_LEN = 300;
const MAX_OPTIONS = 5;
const MAX_ATTEMPTS = 15; // random history samples per round
const TARGET_CANDIDATES = 15; // stop early once we have this many fresh messages to choose from

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Uses the server nickname (what your friends actually see), falling back to the account name.
async function displayName(guild, user) {
  try {
    const member = await guild.members.fetch(user.id);
    return member.displayName;
  } catch {
    return user.globalName ?? user.username;
  }
}

function isGood(msg) {
  if (msg.author.bot || msg.system || !msg.content) return false;
  const len = msg.content.length;
  if (len < MIN_LEN || len > MAX_LEN) return false;
  if (/https?:\/\//i.test(msg.content)) return false;
  if (msg.mentions.users.size > 0 || msg.mentions.everyone) return false;
  if (msg.content.startsWith('/') || msg.content.startsWith('!')) return false;
  return true;
}

// Every text channel the bot can read history in.
function readableChannels(guild) {
  const me = guild.members.me;
  return [...guild.channels.cache.values()].filter(
    (c) =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])
  );
}

/**
 * Picks a round from one channel (onlyChannel) or from every readable channel in the server.
 * Samples random points in history, collects fresh candidates (not in seenIds), then picks one at random.
 * Returns { message, options } or { error }.
 */
async function pickRound(guild, onlyChannel, seenIds = new Set()) {
  const channels = onlyChannel ? [onlyChannel] : readableChannels(guild);
  if (!channels.length) return { error: 'no_channels' };

  const order = shuffle(channels);
  const pool = new Map(); // authorId -> User, used for answer buttons
  const candidates = [];
  const contentSeen = new Set(); // skip identical text ("lol that's crazy" posted 5 times)

  for (let attempt = 0; attempt < MAX_ATTEMPTS && candidates.length < TARGET_CANDIDATES; attempt++) {
    const channel = order[attempt % order.length];
    let batch;
    try {
      const created = SnowflakeUtil.timestampFrom(channel.id);
      const ts = created + Math.floor(Math.random() * (Date.now() - created));
      const before = SnowflakeUtil.generate({ timestamp: ts }).toString();
      batch = await channel.messages.fetch({ limit: 100, before });
    } catch {
      continue; // no access, or a hiccup: move on to another channel
    }
    if (!batch || batch.size === 0) continue;

    for (const m of batch.values()) {
      if (!m.author.bot && !m.system) pool.set(m.author.id, m.author);
      if (!isGood(m) || seenIds.has(m.id)) continue;
      const key = m.content.trim().toLowerCase();
      if (contentSeen.has(key)) continue;
      contentSeen.add(key);
      candidates.push(m);
    }
  }

  if (!candidates.length) return { error: 'no_message' };

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  pool.set(chosen.author.id, chosen.author);
  if (pool.size < 3) return { error: 'few_authors' };

  const others = shuffle([...pool.keys()].filter((id) => id !== chosen.author.id)).slice(0, MAX_OPTIONS - 1);
  const ids = shuffle([chosen.author.id, ...others]);
  const options = await Promise.all(ids.map(async (id) => ({ id, name: await displayName(guild, pool.get(id)) })));
  return { message: chosen, options };
}

module.exports = { pickRound, readableChannels, isGood };