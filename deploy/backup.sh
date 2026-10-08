#!/usr/bin/env bash
# Nightly Postgres dump. Rows are already field-encrypted, and the dump is additionally
# AES-256 encrypted with a passphrase kept in /etc/paisapilot-backup.key (create it once:
#   openssl rand -base64 32 > /etc/paisapilot-backup.key && chmod 600 /etc/paisapilot-backup.key).
# Also enable weekly Lightsail snapshots in the console and copy the key file offline.
set -euo pipefail
DIR=/var/backups/paisapilot
mkdir -p "$DIR" && chmod 700 "$DIR"
sudo -u postgres pg_dump paisapilot | gzip | \
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:/etc/paisapilot-backup.key \
  > "$DIR/paisapilot-$(date +%F).sql.gz.enc"
find "$DIR" -name '*.enc' -mtime +14 -delete
