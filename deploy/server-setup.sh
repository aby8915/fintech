#!/usr/bin/env bash
# ONE-TIME setup on the existing auraa-ai Lightsail box (Ubuntu). Run as a sudo user:
#   sudo bash deploy/server-setup.sh git@github.com:YOUR_USER/paisapilot.git
# Prereq: DNS A record  paisa.auraa-ai.org -> your Lightsail static IP.
set -euo pipefail
REPO="${1:?usage: server-setup.sh <git-ssh-url>}"

apt-get update
apt-get install -y python3-venv python3-dev postgresql nginx certbot python3-certbot-nginx git rsync ufw

# --- users & dirs ---
id paisa &>/dev/null || useradd --system --home /opt/paisapilot --shell /usr/sbin/nologin paisa
id deploy &>/dev/null || adduser --disabled-password --gecos "" deploy
mkdir -p /opt/paisapilot /var/www/paisapilot/web
chown deploy:deploy /opt/paisapilot /var/www/paisapilot/web

# --- PostgreSQL (free: runs on the same instance, listens on localhost only) ---
DB_PASS="$(openssl rand -hex 24)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='paisa'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE paisa LOGIN PASSWORD '${DB_PASS}'"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='paisapilot'" | grep -q 1 || \
  sudo -u postgres createdb -O paisa paisapilot

# --- env file (secrets live ONLY here, root-readable) ---
if [ ! -f /etc/paisapilot.env ]; then
  gen() { python3 -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"; }
  cat > /etc/paisapilot.env <<EOF
APP_ENV=production
DATABASE_URL=postgresql+psycopg://paisa:${DB_PASS}@127.0.0.1:5432/paisapilot
MASTER_KEY=$(gen)
BLIND_INDEX_KEY=$(gen)
JWT_SECRET=$(gen)
GOOGLE_CLIENT_IDS=
ALLOWED_ORIGINS=https://paisa.auraa-ai.org
ANTHROPIC_API_KEY=
AI_MODEL=claude-haiku-5-5
AI_DAILY_QUOTA=40
MAIL_BACKEND=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=PaisaPilot <no-reply@auraa-ai.org>
EOF
  chmod 600 /etc/paisapilot.env
  echo ">>> Edit /etc/paisapilot.env: add GOOGLE_CLIENT_IDS, ANTHROPIC_API_KEY, SMTP_*."
  echo ">>> BACK UP MASTER_KEY + BLIND_INDEX_KEY offline (password manager). Lose them = data is unrecoverable."
fi

# --- code ---
sudo -u deploy bash -c "[ -d /opt/paisapilot/.git ] || git clone '$REPO' /opt/paisapilot"
sudo -u deploy bash -c "cd /opt/paisapilot/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
chmod -R o-rwx /opt/paisapilot; chgrp -R paisa /opt/paisapilot; chmod -R g+rX /opt/paisapilot

# --- services ---
cp /opt/paisapilot/deploy/paisapilot.service /etc/systemd/system/
cp /opt/paisapilot/deploy/paisa-proxy.conf /etc/nginx/snippets/paisa-proxy.conf
echo "deploy ALL=(root) NOPASSWD: /opt/paisapilot/deploy/deploy.sh" > /etc/sudoers.d/paisapilot-deploy
chmod 440 /etc/sudoers.d/paisapilot-deploy

# TLS bootstrap: temporary port-80 site -> obtain cert -> install the full config
printf 'server { listen 80; server_name paisa.auraa-ai.org; root /var/www/paisapilot/web; }\n' > /etc/nginx/sites-available/paisapilot
ln -sf /etc/nginx/sites-available/paisapilot /etc/nginx/sites-enabled/paisapilot
nginx -t && systemctl reload nginx
certbot certonly --nginx -d paisa.auraa-ai.org --non-interactive --agree-tos -m "${CERTBOT_EMAIL:?set CERTBOT_EMAIL}"
cp /opt/paisapilot/deploy/nginx-paisa.conf /etc/nginx/sites-available/paisapilot
nginx -t && systemctl reload nginx

systemctl daemon-reload
(cd /opt/paisapilot/backend && sudo -u paisa env $(grep -v '^#' /etc/paisapilot.env | xargs) .venv/bin/flask --app wsgi:app init-db)
systemctl enable --now paisapilot

# nightly cleanup of expired OTPs / tokens + encrypted DB backup (14 days kept)
cat > /etc/cron.d/paisapilot <<'EOF'
15 3 * * * paisa cd /opt/paisapilot/backend && set -a && . /etc/paisapilot.env && set +a && .venv/bin/flask --app wsgi:app purge-expired
30 3 * * * root /opt/paisapilot/deploy/backup.sh
EOF

ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
echo "Done. Health: curl -s https://paisa.auraa-ai.org/api/v1/health"
