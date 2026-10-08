import hashlib
import json
from collections import defaultdict
from datetime import date

from flask import Blueprint, g, jsonify, request

from . import ai
from .extensions import db, limiter
from .models import Expense, MonthlyInsight
from .security import err, require_auth

bp = Blueprint("reports", __name__, url_prefix="/api/v1/reports")

DISCRETIONARY = {"Food & Dining", "Shopping", "Entertainment", "Subscriptions", "Personal Care", "Travel"}


def _bounds(month: str):
    y, m = map(int, month.split("-"))
    return date(y, m, 1), date(y + (m == 12), m % 12 + 1, 1)


def _prev(month: str) -> str:
    y, m = map(int, month.split("-"))
    return f"{y - (m == 1)}-{(m - 2) % 12 + 1:02d}"


def _load(user, month: str):
    start, end = _bounds(month)
    rows = Expense.query.filter(
        Expense.user_id == user.id, Expense.expense_date >= start, Expense.expense_date < end
    ).all()
    out = []
    for e in rows:
        ctx = ("expense", e.id)
        merchant = user.dec(e.merchant_enc, *ctx, "merchant") if e.merchant_enc else None
        out.append((e.expense_date, e.category, int(user.dec(e.amount_enc, *ctx, "amount")), merchant))
    return out


def _savings(cur, prev_by_cat, total):
    tips = []
    by_cat = defaultdict(int)
    for _, cat, amt, _m in cur:
        by_cat[cat] += amt
    for cat, amt in sorted(by_cat.items(), key=lambda kv: -kv[1]):
        if cat not in DISCRETIONARY or total == 0:
            continue
        share = amt / total
        prev = prev_by_cat.get(cat, 0)
        jump = (amt - prev) / prev if prev else 0
        if share >= 0.15 or jump >= 0.25:
            cut = round(amt * 0.12)
            why = f"up {round(jump * 100)}% vs last month" if jump >= 0.25 else f"{round(share * 100)}% of your spend"
            tips.append({"title": f"Trim {cat} by ~12%", "detail": f"{cat} is {why}.", "est_saving_minor": cut})
    small = [a for _, c, a, _m in cur if c == "Food & Dining" and a < 30000]
    if len(small) >= 10:
        tips.append({
            "title": "Cap small food orders",
            "detail": f"{len(small)} small food/dining spends this month add up. A weekly cap helps.",
            "est_saving_minor": round(sum(small) * 0.2),
        })
    seen = defaultdict(list)
    for _, c, a, m in cur:
        if m and c in {"Subscriptions", "Bills & Utilities", "Entertainment"}:
            seen[m.lower()].append(a)
    subs = [m for m, v in seen.items() if len(v) == 1 and c_is_sub(cur, m)]
    if subs:
        tips.append({"title": "Review recurring payments", "detail": "Still using: " + ", ".join(sorted(subs)[:4]) + "?", "est_saving_minor": 0})
    return tips[:5]


def c_is_sub(cur, merchant_lower):
    return any(c == "Subscriptions" and m and m.lower() == merchant_lower for _, c, _a, m in cur)


@bp.get("/monthly")
@limiter.limit("30/minute")
@require_auth
def monthly():
    month = request.args.get("month") or date.today().strftime("%Y-%m")
    try:
        _bounds(month)
    except ValueError:
        return err(422, "bad_month")
    cur = _load(g.user, month)
    prev = _load(g.user, _prev(month))
    total = sum(a for _, _, a, _m in cur)
    prev_total = sum(a for _, _, a, _m in prev)

    by_cat, prev_by_cat, daily, merchants = defaultdict(int), defaultdict(int), defaultdict(int), defaultdict(int)
    for d, c, a, m in cur:
        by_cat[c] += a
        daily[d.day] += a
        if m:
            merchants[m] += a
    for _, c, a, _m in prev:
        prev_by_cat[c] += a

    start, end = _bounds(month)
    days_in_month = (end - start).days
    result = {
        "month": month,
        "total_minor": total,
        "count": len(cur),
        "prev_total_minor": prev_total,
        "change_pct": round((total - prev_total) / prev_total * 100, 1) if prev_total else None,
        "avg_per_day_minor": round(total / days_in_month) if days_in_month else 0,
        "categories": [
            {"category": c, "amount_minor": a, "pct": round(a / total * 100, 1), "prev_minor": prev_by_cat.get(c, 0)}
            for c, a in sorted(by_cat.items(), key=lambda kv: -kv[1])
        ],
        "daily": [{"day": d, "amount_minor": daily.get(d, 0)} for d in range(1, days_in_month + 1)],
        "top_merchants": [{"merchant": m, "amount_minor": a} for m, a in sorted(merchants.items(), key=lambda kv: -kv[1])[:5]],
        "biggest": max(({"category": c, "amount_minor": a, "date": d.isoformat()} for d, c, a, _m in cur), key=lambda x: x["amount_minor"], default=None),
        "savings": _savings(cur, prev_by_cat, total),
        "ai_tips": None,
    }

    if request.args.get("ai") == "1" and total > 0:
        agg = {
            "month": month, "total": round(total / 100),
            "prev_total": round(prev_total / 100),
            "categories": {c: round(a / 100) for c, a in by_cat.items()},
        }
        h = hashlib.sha256(json.dumps(agg, sort_keys=True).encode()).hexdigest()
        row = db.session.get(MonthlyInsight, (g.user.id, month))
        if row and row.agg_hash == h:
            result["ai_tips"] = json.loads(g.user.dec(row.tips_enc, "insight", month))
        elif ai.consume_quota(g.user):
            try:
                tips = ai.monthly_tips(agg)
            except ai.AiError:
                tips = None
            if tips:
                blob = g.user.enc(json.dumps(tips), "insight", month)
                if row:
                    row.agg_hash, row.tips_enc = h, blob
                else:
                    db.session.add(MonthlyInsight(user_id=g.user.id, month=month, agg_hash=h, tips_enc=blob))
                db.session.commit()
                result["ai_tips"] = tips
    return jsonify(result)
