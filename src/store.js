const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'scores.json');
const SEEN_FILE = path.join(DATA_DIR, 'seen.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const SEEN_MAX = 500; // remember the last 500 used messages per server

let data = {};
let seen = {};
let meta = {};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function player(guildId, userId) {
  data[guildId] ??= {};
  data[guildId][userId] ??= { points: 0, correct: 0, played: 0, streak: 0, bestStreak: 0 };
  return data[guildId][userId];
}

function record(guildId, userId, correct, points) {
  const p = player(guildId, userId);
  p.played += 1;
  if (correct) {
    p.correct += 1;
    p.points += points;
    p.streak += 1;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
  } else {
    p.streak = 0;
  }
  writeJson(FILE, data);
}

function leaderboard(guildId) {
  return Object.entries(data[guildId] || {})
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct);
}

function get(guildId, userId) {
  return (data[guildId] || {})[userId];
}

// Messages already used in a round, so they don't come back.
function seenSet(guildId) {
  return new Set(seen[guildId] || []);
}

function markSeen(guildId, messageId) {
  const list = (seen[guildId] ??= []);
  list.push(messageId);
  if (list.length > SEEN_MAX) list.splice(0, list.length - SEEN_MAX);
  writeJson(SEEN_FILE, seen);
}

// Small key/value settings, e.g. the date of the last daily round.
function getMeta(key) {
  return meta[key];
}

function setMeta(key, value) {
  meta[key] = value;
  writeJson(META_FILE, meta);
}

data = readJson(FILE);
seen = readJson(SEEN_FILE);
meta = readJson(META_FILE);

module.exports = { record, leaderboard, get, seenSet, markSeen, getMeta, setMeta };