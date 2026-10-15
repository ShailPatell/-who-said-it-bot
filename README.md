# Who Said It? (Discord bot)

The bot grabs a random old message from your server, hides the author, and everyone has 30 seconds to guess who wrote it.

## Commands

- `/whosaidit play [channel]` starts a round (defaults to the current channel)
- `/whosaidit leaderboard` shows server standings
- `/whosaidit stats [user]` shows points, accuracy, and streaks

**Scoring:** 1 point per correct guess, 2 for the first correct guesser. One guess per person, and the author can't guess their own message. Messages with links, @mentions, or fewer than 20 characters are skipped.

## Setup

1. Go to https://discord.com/developers/applications and click **New Application**.
2. Copy the **Application ID** (this is `CLIENT_ID`).
3. Open the **Bot** tab, click **Reset Token**, and copy it (this is `DISCORD_TOKEN`).
4. On the same tab, turn on **Message Content Intent** under Privileged Gateway Intents. The bot can't read message text without it.
5. Invite the bot with this link (replace `YOUR_CLIENT_ID`):

   `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=68608`

   That grants View Channels, Send Messages, and Read Message History.
6. In Discord, enable Developer Mode (Settings > Advanced), right-click your server, and **Copy Server ID** (this is `GUILD_ID`).
7. Run:

   ```bash
   cp .env.example .env     # then fill in the three values
   npm install
   npm run deploy           # registers the slash commands
   npm start
   ```

The bot only works in channels where it has View Channel and Read Message History. For private channels, add the bot to them.

## Notes

- Message text is read live from Discord and is not stored. Only scores are saved, in `data/scores.json`.
- Keep `.env` private. If your token ever leaks, hit **Reset Token** in the portal.
- To keep it running 24/7 for free, see [HOSTING.md](HOSTING.md).
- Quick idea for later: a `/whosaidit daily` that posts one round every day at a set time.
