# PaisaPilot — Har rupay ka hisaab, AI ke saath

AI expense tracker for Android, iOS and web. One codebase (Expo/React Native) + Flask API + PostgreSQL, hosted on your existing auraa-ai Lightsail server at **paisa.auraa-ai.org**.

## What it does
- **Log expenses 3 ways:** type/speak ("Zomato 450 kal raat", English or Hinglish) or snap a bill. AI fills amount, category, merchant, date, note; you confirm before it saves.
- **Monthly report:** donut by category, day-by-day bars, month-over-month change, top spends, and "Bachat avenues" (rule-based savings with ₹ estimates) plus optional AI coach tips.
- **Accounts:** email + password with 6-digit email verification, Google sign-in, OTP password reset, lockout, session rotation, account deletion.

## Low token cost
- Haiku-class model, ~200-token replies, JSON only.
- Voice → text happens **on the device** (free). Only the transcript is sent.
- Receipts downscaled to 1024px; never stored.
- Monthly tips use category totals only and are cached until your numbers change.
- Per-user daily AI quota (`AI_DAILY_QUOTA`, default 40). Manual entry always works.

## Security design
| Area | What's done |
|---|---|
| PII at rest | Per-user data key (AES-256-GCM) wrapped by `MASTER_KEY` held only in the server env. Name, email, amount, merchant, note encrypted; ciphertext bound to user/row/field (can't be swapped). Email lookup via HMAC blind index. |
| Passwords | argon2id, constant-time login path, 5-fail lockout (15 min) |
| Sessions | 15-min JWT + rotating refresh tokens with reuse detection; password reset revokes everything |
| OTP | 6 digits, HMAC-hashed, 10-min expiry, 5 attempts, rate limited, no account enumeration |
| Google | ID token verified server-side against your client IDs; unverified pre-registrations are neutralised on link |
| API | Strict input validation (no input echoed back), per-route rate limits + nginx limits, user-scoped queries only, CORS allow-list, 6 MB upload cap, image re-encode (strips EXIF/GPS), decompression-bomb guard |
| AI | No tools, strict output schema, injection-resistant prompts, quotas |
| Transport/server | TLS 1.2+, HSTS, strict CSP, hardened systemd unit, localhost-only Postgres, ufw |
| Pipeline | CodeQL, pip-audit, npm audit, gitleaks, bandit, Dependabot, pinned SSH host key |

### Known limits (be aware)
- No system is "zero vulnerabilities". Run the pipeline, keep dependencies updated, and consider an external pentest before public launch.
- Web refresh token sits in `localStorage` (guarded by strict CSP). Hardening path: httpOnly cookie + CSRF token.
- Category and date are stored unencrypted so month reports/indexes work. Everything identifying or monetary is encrypted. Reports decrypt in server memory per request.
- Lose `MASTER_KEY` or `BLIND_INDEX_KEY` and data is unrecoverable. Back them up offline.
- Rate-limit counters are in memory (single gunicorn worker by design). Use Redis if you scale out.

## One-time setup

### 1. Accounts/keys
1. **Google Cloud Console** → OAuth consent screen + 3 OAuth client IDs (Web, Android, iOS). Web authorized origin: `https://paisa.auraa-ai.org`.
2. **Anthropic API key** (can reuse the one from your other apps, ideally a separate key with a spend cap).
3. **SMTP** for OTP emails: Brevo free tier (300/day) or Amazon SES. Add SPF/DKIM for `auraa-ai.org`.
4. **DNS:** A record `paisa.auraa-ai.org` → your Lightsail static IP.

### 2. GitHub
Create a private repo, push this folder to `main`. On the server add a read-only **deploy key**. In the repo → Settings → Environments → `production`, add secrets:
`LIGHTSAIL_HOST`, `LIGHTSAIL_SSH_KEY` (private key for user `deploy`), `LIGHTSAIL_HOST_KEY` (output of `ssh-keyscan -t ed25519 <ip>` taken once from a trusted network), `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`.

### 3. Server (once)
```bash
sudo CERTBOT_EMAIL=you@auraa-ai.org bash deploy/server-setup.sh git@github.com:YOU/paisapilot.git
sudo nano /etc/paisapilot.env     # GOOGLE_CLIENT_IDS, ANTHROPIC_API_KEY, SMTP_*
sudo systemctl restart paisapilot
```
After that every push to `main` runs tests → builds the web app → rsyncs it → runs `deploy.sh` (fetch, reset --hard, restart, health check), same flow as your other apps.

### 4. Mobile builds
```bash
cd app && cp .env.example .env   # fill the Google client IDs
npx expo install --fix
npx eas build -p android --profile production   # Play Store: one-time $25
npx eas build -p ios --profile production       # App Store: $99/yr Apple Developer
```
Voice uses `expo-speech-recognition`, which needs a dev/production build (not Expo Go). The web build uses the browser's speech engine (Chrome/Edge/Safari).

## Local development
```bash
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
export APP_ENV=development MAIL_BACKEND=console MASTER_KEY=$(python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())") BLIND_INDEX_KEY=$(python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())") JWT_SECRET=dev-secret-change-me-dev-secret-change-me
flask --app wsgi:app init-db && flask --app wsgi:app run -p 8100
cd ../app && EXPO_PUBLIC_API_URL=http://localhost:8100/api/v1 npx expo start --web
pytest backend   # 10 tests incl. encryption-at-rest and session-revocation checks
```

## Free database tier
PostgreSQL runs on your existing Lightsail instance — no extra cost, no third party holding data. If you'd rather use a managed free tier (Neon/Supabase), only `DATABASE_URL` changes.
