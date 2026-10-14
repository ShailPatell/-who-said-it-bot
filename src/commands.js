const { SlashCommandBuilder, ChannelType } = require('discord.js');

const whosaidit = new SlashCommandBuilder()
  .setName('whosaidit')
  .setDescription('Guess who said a random old message')
  .addSubcommand((s) =>
    s
      .setName('play')
      .setDescription('Start a round')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Pull the message from this channel (default: this one)')
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((s) => s.setName('leaderboard').setDescription('Server standings'))
  .addSubcommand((s) =>
    s
      .setName('stats')
      .setDescription('Your (or someone\'s) stats')
      .addUserOption((o) => o.setName('user').setDescription('Who to look up'))
  );

module.exports = [whosaidit.toJSON()];
