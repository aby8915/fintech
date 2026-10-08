import logging
import smtplib
import threading
from email.message import EmailMessage

log = logging.getLogger("paisapilot.mail")


def _smtp_send(cfg: dict, to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = cfg["MAIL_FROM"], to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(cfg["SMTP_HOST"], cfg["SMTP_PORT"], timeout=15) as s:
            s.starttls()
            s.login(cfg["SMTP_USER"], cfg["SMTP_PASSWORD"])
            s.send_message(msg)
    except Exception:  # never log the address or body
        log.exception("mail delivery failed")


def send_mail(app, to: str, subject: str, body: str) -> None:
    backend = app.config["MAIL_BACKEND"]
    if backend == "memory":
        app.outbox.append({"to": to, "subject": subject, "body": body})
    elif backend == "console":
        if app.config["APP_ENV"] == "production":
            raise RuntimeError("MAIL_BACKEND=console is not allowed in production")
        log.warning("DEV MAIL -> %s | %s\n%s", to, subject, body)
    else:
        cfg = {k: app.config[k] for k in ("MAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD")}
        # Sent off-thread so response time never reveals whether an account exists.
        threading.Thread(target=_smtp_send, args=(cfg, to, subject, body), daemon=True).start()


def send_otp(app, to: str, code: str, purpose: str) -> None:
    what = "verify your email" if purpose == "verify" else "reset your password"
    send_mail(
        app,
        to,
        f"PaisaPilot code: {code}",
        f"Use this code to {what}: {code}\n\nIt expires in {app.config['OTP_MINUTES']} minutes. "
        "If you didn't ask for it, ignore this email - your account is safe.",
    )


def send_notice(app, to: str, text: str) -> None:
    send_mail(app, to, "PaisaPilot account notice", text)
