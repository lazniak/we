# Push to GitHub - Instructions

## 1. Push to GitHub (from local machine)

```bash
cd A:\code\Transfer
git push -u origin main
```

If you get authentication error, you may need to:
- Use GitHub Personal Access Token instead of password
- Or use SSH: `git remote set-url origin git@github.com:lazniak/we.git`

## 2. On VPS - Run Deployment

SSH into your VPS:
```bash
ssh root@72.61.80.71
```

Then run the deployment commands from `DEPLOY_COMMANDS.txt` or use the automated script:

```bash
# Option 1: Manual (copy-paste commands from DEPLOY_COMMANDS.txt)
# Option 2: Automated script
cd /var/www
wget https://raw.githubusercontent.com/lazniak/we/main/deploy.sh
chmod +x deploy.sh
./deploy.sh
```

## 3. Quick Deploy Script (if you upload deploy.sh)

```bash
cd /var/www
git clone https://github.com/lazniak/we.git
cd we
chmod +x deploy.sh
./deploy.sh
```

## Important Notes

- Replace `your-email@example.com` in Certbot command with your actual email
- Make sure domain `we.pablogfx.com` DNS points to `72.61.80.71`
- After deployment, check: `pm2 status` and `systemctl status nginx`
- View logs: `pm2 logs`
