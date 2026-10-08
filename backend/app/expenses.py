from datetime import date, timedelta
from typing import Literal

from flask import Blueprint, g, jsonify, request
from pydantic import BaseModel, Field, field_validator

from . import ai
from .extensions import db, limiter
from .models import Expense, new_id
from .security import err, require_auth, validated

bp = Blueprint("expenses", __name__, url_prefix="/api/v1/expenses")

MAX_MINOR = 100_000_000_00  # ₹10 crore


class ExpenseIn(BaseModel):
    amount_minor: int = Field(gt=0, le=MAX_MINOR)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    category: str
    expense_date: date
    merchant: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    source: Literal["manual", "voice", "receipt"] = "manual"

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v not in ai.CATEGORIES:
            raise ValueError("unknown category")
        return v

    @field_validator("expense_date")
    @classmethod
    def _date(cls, v):
        if v > date.today() + timedelta(days=1) or v < date(2000, 1, 1):
            raise ValueError("date out of range")
        return v


class ExpensePatch(BaseModel):
    amount_minor: int | None = Field(default=None, gt=0, le=MAX_MINOR)
    category: str | None = None
    expense_date: date | None = None
    merchant: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v is not None and v not in ai.CATEGORIES:
            raise ValueError("unknown category")
        return v


class TextIn(BaseModel):
    text: str = Field(min_length=2, max_length=500)


def to_dict(user, e: Expense) -> dict:
    ctx = ("expense", e.id)
    return {
        "id": e.id,
        "amount_minor": int(user.dec(e.amount_enc, *ctx, "amount")),
        "currency": e.currency,
        "category": e.category,
        "expense_date": e.expense_date.isoformat(),
        "merchant": user.dec(e.merchant_enc, *ctx, "merchant") if e.merchant_enc else None,
        "note": user.dec(e.note_enc, *ctx, "note") if e.note_enc else None,
        "source": e.source,
    }


def _set_secret_fields(user, e: Expense, amount_minor=None, merchant=..., note=...):
    ctx = ("expense", e.id)
    if amount_minor is not None:
        e.amount_enc = user.enc(str(amount_minor), *ctx, "amount")
    if merchant is not ...:
        e.merchant_enc = user.enc(merchant.strip(), *ctx, "merchant") if merchant else None
    if note is not ...:
        e.note_enc = user.enc(note.strip(), *ctx, "note") if note else None


@bp.get("")
@limiter.limit("120/minute")
@require_auth
def list_expenses():
    q = Expense.query.filter_by(user_id=g.user.id)
    month = request.args.get("month")
    if month:
        try:
            y, m = map(int, month.split("-"))
            start = date(y, m, 1)
            end = date(y + (m == 12), m % 12 + 1, 1)
        except ValueError:
            return err(422, "bad_month")
        q = q.filter(Expense.expense_date >= start, Expense.expense_date < end)
    rows = q.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).limit(500).all()
    return jsonify(items=[to_dict(g.user, e) for e in rows])


@bp.post("")
@limiter.limit("60/minute")
@require_auth
@validated(ExpenseIn)
def create_expense(data: ExpenseIn):
    e = Expense(
        id=new_id(), user_id=g.user.id, expense_date=data.expense_date,
        category=data.category, currency=data.currency, source=data.source, amount_enc="",
    )
    _set_secret_fields(g.user, e, data.amount_minor, data.merchant, data.note)
    db.session.add(e)
    db.session.commit()
    return jsonify(to_dict(g.user, e)), 201


@bp.patch("/<expense_id>")
@limiter.limit("60/minute")
@require_auth
@validated(ExpensePatch)
def patch_expense(data: ExpensePatch, expense_id: str):
    e = Expense.query.filter_by(id=expense_id, user_id=g.user.id).first()
    if e is None:
        return err(404, "not_found")
    fields = data.model_dump(exclude_unset=True)
    if "category" in fields and fields["category"]:
        e.category = fields["category"]
    if "expense_date" in fields and fields["expense_date"]:
        e.expense_date = fields["expense_date"]
    _set_secret_fields(
        g.user, e, fields.get("amount_minor"),
        fields["merchant"] if "merchant" in fields else ...,
        fields["note"] if "note" in fields else ...,
    )
    db.session.commit()
    return jsonify(to_dict(g.user, e))


@bp.delete("/<expense_id>")
@limiter.limit("60/minute")
@require_auth
def delete_expense(expense_id: str):
    e = Expense.query.filter_by(id=expense_id, user_id=g.user.id).first()
    if e is None:
        return err(404, "not_found")
    db.session.delete(e)
    db.session.commit()
    return "", 204


# ---- AI drafts: nothing is saved until the user confirms in the app ----
@bp.post("/parse-text")
@limiter.limit("20/minute")
@require_auth
@validated(TextIn)
def parse_text(data: TextIn):
    if not ai.consume_quota(g.user):
        return err(429, "ai_daily_limit")
    try:
        return jsonify(ai.parse_text(data.text))
    except ai.AiError as e:
        return err(422 if str(e) == "no_expense_found" else 502, str(e))


@bp.post("/parse-receipt")
@limiter.limit("10/minute")
@require_auth
def parse_receipt():
    f = request.files.get("image")
    if f is None:
        return err(422, "image_required")
    if not ai.consume_quota(g.user):
        return err(429, "ai_daily_limit")
    try:
        draft = ai.parse_receipt(ai.prepare_image(f.read()))
    except ai.AiError as e:
        return err(422 if str(e) in {"no_expense_found", "invalid_image"} else 502, str(e))
    draft["source"] = "receipt"
    return jsonify(draft)
