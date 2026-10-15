# Hosting 24/7 for free

The bot keeps a live connection to Discord and saves scores to `data/*.json`, so it needs a machine that stays on and keeps its disk. Free "web app" hosts that sleep or wipe the disk on restart (Render free tier, etc.) won't work.

## Cheapest option: a free-tier VM ($0/month)

Either of these works. Both ask for a card at signup but don't charge for the free tier.

- **Oracle Cloud Always Free**: create an Ubuntu VM with shape `VM.Standard.A1.Flex` (ARM, 1 OCPU / 6 GB is plenty) or `VM.Standard.E2.1.Micro`.
- **Google Cloud free tier**: one `e2-micro` VM in `us-west1`, `us-central1`, or `us-east1`, with a standard persistent disk up to 30 GB.

No ports need to be opened. The bot only makes outbound connections.

### Setup on the VM

SSH in, then:

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Get the bot
git clone https://github.com/ShailPatell/-who-said-it-bot.git
cd -who-said-it-bot
npm install --omit=dev
cp .env.example .env
nano .env                # fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID (and DAILY_* if you want)
npm run deploy           # register slash commands (once)

# Run it as a service that restarts on crash and on reboot
sudo cp deploy/whosaidit.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whosaidit
```

`deploy/whosaidit.service` assumes the user is `ubuntu` and the repo is in `/home/ubuntu/-who-said-it-bot`. On Google Cloud your username is different, so edit `User=` and `WorkingDirectory=` first.

Useful commands:

```bash
sudo systemctl status whosaidit     # is it running?
journalctl -u whosaidit -f          # live logs
git pull && npm install --omit=dev && sudo systemctl restart whosaidit   # update
```

Back up `data/` now and then (`scp` it to your computer). It holds all the scores.

## If you'd rather pay a little for less setup

- **Hetzner Cloud** (about €4/month): same steps as above on their smallest VM.
- **Railway** ($5/month Hobby plan): connect the GitHub repo, set the env vars, start command `npm start`, and attach a volume mounted at `/app/data` so scores survive redeploys.
- **A computer that's always on** (Raspberry Pi, old laptop): same steps as the VM, or `npx pm2 start src/index.js --name whosaidit && npx pm2 save`.
