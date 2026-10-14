const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'scores.json');
let data = {};

function load() {
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    data = {};
  }
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
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
  save();
}

function leaderboard(guildId) {
  return Object.entries(data[guildId] || {})
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct);
}

function get(guildId, userId) {
  return (data[guildId] || {})[userId];
}

load();

module.exports = { record, leaderboard, get };
