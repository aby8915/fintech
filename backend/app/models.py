import uuid
from datetime import datetime, timezone

from flask import current_app

from .extensions import db


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; treat them as UTC."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=new_id)
    email_bidx = db.Column(db.String(64), unique=True, nullable=False, index=True)
    google_sub_bidx = db.Column(db.String(64), unique=True, nullable=True)
    email_enc = db.Column(db.Text, nullable=False)
    name_enc = db.Column(db.Text, nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    wrapped_dek = db.Column(db.Text, nullable=False)
    email_verified = db.Column(db.Boolean, nullable=False, default=False)
    token_version = db.Column(db.Integer, nullable=False, default=0)
    failed_logins = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    expenses = db.relationship("Expense", cascade="all, delete-orphan")
    refresh_tokens = db.relationship("RefreshToken", cascade="all, delete-orphan")
    ai_usage = db.relationship("AiUsage", cascade="all, delete-orphan")
    insights = db.relationship("MonthlyInsight", cascade="all, delete-orphan")

    @property
    def dek(self) -> bytes:
        if not hasattr(self, "_dek"):
            self._dek = current_app.crypto.unwrap_dek(self.wrapped_dek, self.id)
        return self._dek

    def enc(self, value: str, *ctx: str) -> str:
        return current_app.crypto.encrypt(self.dek, value, "|".join((self.id, *ctx)))

    def dec(self, blob: str, *ctx: str) -> str:
        return current_app.crypto.decrypt(self.dek, blob, "|".join((self.id, *ctx)))


class RefreshToken(db.Model):
    __tablename__ = "refresh_tokens"

    id = db.Column(db.String(36), primary_key=True, default=new_id)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    family_id = db.Column(db.String(36), nullable=False, index=True)
    token_hash = db.Column(db.String(64), unique=True, nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    revoked = db.Column(db.Boolean, nullable=False, default=False)


class OtpCode(db.Model):
    __tablename__ = "otp_codes"

    id = db.Column(db.String(36), primary_key=True, default=new_id)
    email_bidx = db.Column(db.String(64), nullable=False, index=True)
    purpose = db.Column(db.String(16), nullable=False)  # verify | reset
    code_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    used = db.Column(db.Boolean, nullable=False, default=False)


class Expense(db.Model):
    __tablename__ = "expenses"
    __table_args__ = (db.Index("ix_expenses_user_date", "user_id", "expense_date"),)

    id = db.Column(db.String(36), primary_key=True, default=new_id)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expense_date = db.Column(db.Date, nullable=False)      # plaintext: needed for range queries
    category = db.Column(db.String(32), nullable=False)    # plaintext: low sensitivity, indexable
    currency = db.Column(db.String(3), nullable=False, default="INR")
    source = db.Column(db.String(8), nullable=False, default="manual")  # manual | voice | receipt
    amount_enc = db.Column(db.Text, nullable=False)        # encrypted (paise as integer string)
    merchant_enc = db.Column(db.Text, nullable=True)       # encrypted
    note_enc = db.Column(db.Text, nullable=True)           # encrypted
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class AiUsage(db.Model):
    __tablename__ = "ai_usage"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day = db.Column(db.Date, primary_key=True)
    count = db.Column(db.Integer, nullable=False, default=0)


class MonthlyInsight(db.Model):
    __tablename__ = "monthly_insights"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    month = db.Column(db.String(7), primary_key=True)
    agg_hash = db.Column(db.String(64), nullable=False)
    tips_enc = db.Column(db.Text, nullable=False)
