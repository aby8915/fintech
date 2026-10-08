import hashlib
import hmac
import secrets
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from flask import Blueprint, current_app, g, jsonify
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token as g_id_token
from pydantic import BaseModel, EmailStr, Field

from . import mailer
from .extensions import db, limiter
from .models import OtpCode, RefreshToken, User, aware, new_id, utcnow
from .security import JWT_AUD, JWT_ISS, err, require_auth, validated

bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")
ph = PasswordHasher()  # argon2id
DUMMY_HASH = ph.hash("timing-equalizer-not-a-real-password")


# ---------- schemas ----------
Password = Field(min_length=10, max_length=128)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Password
    name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailIn(BaseModel):
    email: EmailStr


class OtpIn(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^\d{6}$")


class ResetIn(OtpIn):
    new_password: str = Password


class GoogleIn(BaseModel):
    id_token: str = Field(min_length=20, max_length=4096)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


# ---------- helpers ----------
def _bidx(value: str) -> str:
    return current_app.crypto.blind_index(value)


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _weak(password: str) -> bool:
    return len(set(password)) < 5 or password.lower() in {"password123", "1234567890", "qwertyuiop"}


def _create_user(email: str, name: str, password_hash: str | None, verified: bool, google_sub: str | None = None) -> User:
    user = User(
        id=new_id(),
        email_bidx=_bidx(email),
        google_sub_bidx=_bidx(google_sub) if google_sub else None,
        email_enc="",
        name_enc="",
        password_hash=password_hash,
        wrapped_dek="",
        email_verified=verified,
    )
    dek = current_app.crypto.new_dek()
    user.wrapped_dek = current_app.crypto.wrap_dek(dek, user.id)
    user._dek = dek
    user.email_enc = user.enc(email, "email")
    user.name_enc = user.enc(name, "name")
    db.session.add(user)
    return user


def issue_tokens(user: User, family_id: str | None = None) -> dict:
    cfg = current_app.config
    now = utcnow()
    access = jwt.encode(
        {
            "sub": user.id,
            "tv": user.token_version,
            "iat": now,
            "exp": now + timedelta(minutes=cfg["ACCESS_TOKEN_MINUTES"]),
            "iss": JWT_ISS,
            "aud": JWT_AUD,
        },
        cfg["JWT_SECRET"],
        algorithm="HS256",
    )
    raw = secrets.token_urlsafe(48)
    db.session.add(
        RefreshToken(
            user_id=user.id,
            family_id=family_id or new_id(),
            token_hash=_sha(raw),
            expires_at=now + timedelta(days=cfg["REFRESH_TOKEN_DAYS"]),
        )
    )
    db.session.commit()
    return {"access_token": access, "refresh_token": raw, "expires_in": cfg["ACCESS_TOKEN_MINUTES"] * 60}


def _send_new_otp(email: str, purpose: str) -> None:
    cfg = current_app.config
    bidx = _bidx(email)
    OtpCode.query.filter_by(email_bidx=bidx, purpose=purpose, used=False).update({"used": True})
    code = f"{secrets.randbelow(10**6):06d}"
    db.session.add(
        OtpCode(
            email_bidx=bidx,
            purpose=purpose,
            code_hash=hmac.new(_blind_key(), f"{purpose}:{code}".encode(), hashlib.sha256).hexdigest(),
            expires_at=utcnow() + timedelta(minutes=cfg["OTP_MINUTES"]),
        )
    )
    db.session.commit()
    mailer.send_otp(current_app._get_current_object(), email, code, purpose)


def _blind_key() -> bytes:
    return current_app.crypto._blind


def _check_otp(email: str, purpose: str, code: str) -> bool:
    row = (
        OtpCode.query.filter_by(email_bidx=_bidx(email), purpose=purpose, used=False)
        .order_by(OtpCode.expires_at.desc())
        .first()
    )
    if row is None or aware(row.expires_at) < utcnow():
        return False
    if row.attempts >= current_app.config["OTP_MAX_ATTEMPTS"]:
        return False
    row.attempts += 1
    expected = hmac.new(_blind_key(), f"{purpose}:{code}".encode(), hashlib.sha256).hexdigest()
    ok = hmac.compare_digest(expected, row.code_hash)
    if ok:
        row.used = True
    db.session.commit()
    return ok


def _find(email: str) -> User | None:
    return User.query.filter_by(email_bidx=_bidx(email)).first()


# ---------- routes ----------
@bp.post("/register")
@limiter.limit("5/hour")
@validated(RegisterIn)
def register(data: RegisterIn):
    if _weak(data.password):
        return err(422, "weak_password")
    email = data.email.lower()
    app = current_app._get_current_object()
    existing = _find(email)
    if existing is None:
        _create_user(email, data.name.strip(), ph.hash(data.password), verified=False)
        db.session.commit()
        _send_new_otp(email, "verify")
    elif not existing.email_verified:
        # Latest registrant wins until the real owner proves control of the inbox (anti pre-hijack).
        existing.password_hash = ph.hash(data.password)
        existing.name_enc = existing.enc(data.name.strip(), "name")
        db.session.commit()
        _send_new_otp(email, "verify")
    else:
        mailer.send_notice(app, email, "Someone tried to register with this email. You already have an account - use 'Forgot password' if needed.")
    return jsonify(status="verification_sent"), 202  # identical response in every branch


@bp.post("/verify-email")
@limiter.limit("10/hour")
@validated(OtpIn)
def verify_email(data: OtpIn):
    user = _find(data.email)
    if not user or not _check_otp(data.email, "verify", data.otp):
        return err(400, "invalid_or_expired_code")
    user.email_verified = True
    db.session.commit()
    return jsonify(issue_tokens(user))


@bp.post("/resend-verification")
@limiter.limit("3/hour")
@validated(EmailIn)
def resend_verification(data: EmailIn):
    user = _find(data.email)
    if user and not user.email_verified:
        _send_new_otp(data.email.lower(), "verify")
    return jsonify(status="sent_if_applicable"), 202


@bp.post("/login")
@limiter.limit("10/minute")
@validated(LoginIn)
def login(data: LoginIn):
    user = _find(data.email)
    if user and user.locked_until and aware(user.locked_until) > utcnow():
        return err(429, "account_temporarily_locked")
    ok = False
    try:  # always run a hash verify so timing doesn't reveal whether the account exists
        ph.verify(user.password_hash if user and user.password_hash else DUMMY_HASH, data.password)
        ok = bool(user and user.password_hash)
    except (VerifyMismatchError, InvalidHashError):
        pass
    if not ok:
        if user:
            user.failed_logins += 1
            if user.failed_logins >= 5:
                user.locked_until = utcnow() + timedelta(minutes=15)
                user.failed_logins = 0
            db.session.commit()
        return err(401, "invalid_credentials")
    if not user.email_verified:
        return err(403, "email_not_verified")
    user.failed_logins, user.locked_until = 0, None
    if ph.check_needs_rehash(user.password_hash):
        user.password_hash = ph.hash(data.password)
    return jsonify(issue_tokens(user))


@bp.post("/google")
@limiter.limit("20/minute")
@validated(GoogleIn)
def google_login(data: GoogleIn):
    client_ids = current_app.config["GOOGLE_CLIENT_IDS"]
    try:
        info = g_id_token.verify_oauth2_token(data.id_token, g_requests.Request())
    except ValueError:
        return err(401, "invalid_google_token")
    if info.get("aud") not in client_ids or not info.get("email_verified") or not info.get("email"):
        return err(401, "invalid_google_token")
    email, sub = info["email"].lower(), info["sub"]
    user = User.query.filter_by(google_sub_bidx=_bidx(sub)).first() or _find(email)
    if user is None:
        user = _create_user(email, (info.get("name") or email.split("@")[0])[:80], None, True, google_sub=sub)
    else:
        if not user.email_verified:
            user.password_hash = None  # drop any attacker-set password on an unverified pre-registration
        user.email_verified = True
        user.google_sub_bidx = user.google_sub_bidx or _bidx(sub)
    db.session.commit()
    return jsonify(issue_tokens(user))


@bp.post("/refresh")
@limiter.limit("60/hour")
@validated(RefreshIn)
def refresh(data: RefreshIn):
    row = RefreshToken.query.filter_by(token_hash=_sha(data.refresh_token)).first()
    if row is None:
        return err(401, "invalid_refresh_token")
    if row.revoked:  # reuse of a rotated token => likely theft: kill the whole family
        RefreshToken.query.filter_by(family_id=row.family_id).update({"revoked": True})
        db.session.commit()
        return err(401, "invalid_refresh_token")
    if aware(row.expires_at) < utcnow():
        return err(401, "invalid_refresh_token")
    row.revoked = True
    user = db.session.get(User, row.user_id)
    return jsonify(issue_tokens(user, family_id=row.family_id))


@bp.post("/logout")
@limiter.limit("30/hour")
@validated(RefreshIn)
def logout(data: RefreshIn):
    row = RefreshToken.query.filter_by(token_hash=_sha(data.refresh_token)).first()
    if row:
        RefreshToken.query.filter_by(family_id=row.family_id).update({"revoked": True})
        db.session.commit()
    return "", 204


@bp.post("/password/forgot")
@limiter.limit("3/hour")
@validated(EmailIn)
def forgot(data: EmailIn):
    user = _find(data.email)
    if user and user.email_verified:
        _send_new_otp(data.email.lower(), "reset")
    return jsonify(status="sent_if_account_exists"), 202


@bp.post("/password/reset")
@limiter.limit("10/hour")
@validated(ResetIn)
def reset(data: ResetIn):
    if _weak(data.new_password):
        return err(422, "weak_password")
    user = _find(data.email)
    if not user or not _check_otp(data.email, "reset", data.otp):
        return err(400, "invalid_or_expired_code")
    user.password_hash = ph.hash(data.new_password)
    user.token_version += 1  # invalidates every access token
    user.failed_logins, user.locked_until = 0, None
    RefreshToken.query.filter_by(user_id=user.id).update({"revoked": True})  # and every session
    db.session.commit()
    return jsonify(status="password_updated")


@bp.get("/me")
@require_auth
def me():
    u = g.user
    return jsonify(id=u.id, email=u.dec(u.email_enc, "email"), name=u.dec(u.name_enc, "name"))


@bp.delete("/me")
@limiter.limit("3/hour")
@require_auth
def delete_me():
    db.session.delete(g.user)  # cascades: expenses, tokens, usage, insights
    db.session.commit()
    return "", 204
