/**
 * Scores a finished round. guesses is a Map of userId -> guessed author id,
 * in the order the guesses came in. The first correct guesser gets 2 points,
 * every other correct guesser gets 1.
 */
function scoreRound(guesses, correctId) {
  const winners = [];
  const losers = [];
  for (const [userId, guess] of guesses) {
    if (guess === correctId) {
      winners.push({ userId, pts: winners.length === 0 ? 2 : 1 });
    } else {
      losers.push({ userId });
    }
  }
  return { winners, losers };
}

module.exports = { scoreRound };
