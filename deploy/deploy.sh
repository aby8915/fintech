#!/usr/bin/env bash
# Runs on the server via GitHub Actions (sudo, single allow-listed command).
# Same flow as your other apps: fetch -> reset --hard -> restart -> health check.
set -euo pipefail
cd /opt/paisapilot
sudo -u deploy git fetch --prune origin main
sudo -u deploy git reset --hard origin/main
sudo -u deploy backend/.venv/bin/pip install -q -r backend/requirements.txt
chmod -R o-rwx /opt/paisapilot; chgrp -R paisa /opt/paisapilot; chmod -R g+rX /opt/paisapilot

cp deploy/paisapilot.service /etc/systemd/system/ && systemctl daemon-reload
cp deploy/paisa-proxy.conf /etc/nginx/snippets/paisa-proxy.conf
cp deploy/nginx-paisa.conf /etc/nginx/sites-available/paisapilot && nginx -t && systemctl reload nginx

(cd backend && sudo -u paisa env $(grep -v '^#' /etc/paisapilot.env | xargs) .venv/bin/flask --app wsgi:app init-db)
systemctl restart paisapilot

for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:8100/api/v1/health >/dev/null; then echo "healthy"; exit 0; fi
  sleep 2
done
echo "health check FAILED" >&2
journalctl -u paisapilot -n 40 --no-pager >&2
exit 1
