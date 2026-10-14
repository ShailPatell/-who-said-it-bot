const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const store = require('./store');
const { scoreRound } = require('./scoring');
const { pickRound } = require('./picker');

const PICK_ERRORS = {
  no_channels: 'I can\'t read history in any channel. Give me View Channel + Read Message History.',
  no_message: 'I couldn\'t find a fresh message this time. Try again.',
  few_authors: 'Not enough different people in the messages I found. Try again.',
};

function buttonsFor(options, disabled = false, correctId = null) {
  const row = new ActionRowBuilder();
  for (const o of options) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`guess:${o.id}`)
        .setLabel(o.name.slice(0, 80))
        .setDisabled(disabled)
        .setStyle(correctId ? (o.id === correctId ? ButtonStyle.Success : ButtonStyle.Secondary) : ButtonStyle.Primary)
    );
  }
  return row;
}

/**
 * Runs one full round: pick a message, post it, collect guesses, reveal and score.
 * send(payload) must post the round message and return it; edit(payload) updates it.
 * release() is called when the round is finished (or fails) so the channel unlocks.
 * Returns { ok: true } or { error, message }.
 */
async function runRound({ guild, onlyChannel = null, roundMs, header, send, edit, release }) {
  try {
    const round = await pickRound(guild, onlyChannel, store.seenSet(guild.id));
    if (round.error) {
      release();
      return { error: round.error, message: PICK_ERRORS[round.error] ?? 'Something went wrong picking a message.' };
    }

    const { message: target, options } = round;
    store.markSeen(guild.id, target.id);

    const endsAt = Math.floor((Date.now() + roundMs) / 1000);
    const embed = new EmbedBuilder()
      .setTitle('Who said it?')
      .setDescription(`>>> ${target.content}`)
      .setFooter({ text: 'One guess each. The author sits this one out.' })
      .addFields({ name: 'Time is up', value: `<t:${endsAt}:R>` });

    const sent = await send({
      content: header,
      embeds: [embed],
      components: [buttonsFor(options)],
      allowedMentions: { parse: [] },
    });

    const guesses = new Map(); // userId -> guessed author id
    const collector = sent.createMessageComponentCollector({ time: roundMs });

    collector.on('collect', async (i) => {
      if (i.user.id === target.author.id) {
        return i.reply({ content: 'You wrote this one. Sit this round out and let them squirm.', ephemeral: true });
      }
      if (guesses.has(i.user.id)) {
        return i.reply({ content: 'You already locked in a guess.', ephemeral: true });
      }
      const guess = i.customId.split(':')[1];
      guesses.set(i.user.id, guess);
      console.log(`[round] ${i.user.username} guessed ${guess}`);
      return i.reply({ content: 'Locked in. No take-backs.', ephemeral: true });
    });

    collector.on('end', async () => {
      try {
        const correctId = target.author.id;
        console.log(`[round] answer was ${correctId} (${target.author.username}); ${guesses.size} guess(es)`);
        const scored = scoreRound(guesses, correctId);
        const winners = scored.winners.map(({ userId, pts }) => {
          store.record(guild.id, userId, true, pts);
          return `<@${userId}> (+${pts})`;
        });
        const losers = scored.losers.map(({ userId }) => {
          store.record(guild.id, userId, false, 0);
          return `<@${userId}>`;
        });

        const reveal = new EmbedBuilder()
          .setTitle('Who said it?')
          .setDescription(`>>> ${target.content}`)
          .addFields(
            { name: 'Answer', value: `<@${correctId}> in ${target.channel}, <t:${Math.floor(target.createdTimestamp / 1000)}:D>\n[Jump to message](${target.url})` },
            { name: 'Got it', value: winners.join('\n') || 'Nobody. Embarrassing.', inline: true },
            { name: 'Missed', value: losers.join('\n') || 'No misses', inline: true }
          );

        await edit({
          embeds: [reveal],
          components: [buttonsFor(options, true, correctId)],
          allowedMentions: { parse: [] },
        });
      } catch (err) {
        console.error('Failed to reveal round:', err);
      } finally {
        release();
      }
    });

    return { ok: true };
  } catch (err) {
    release();
    throw err;
  }
}

module.exports = { runRound, buttonsFor };