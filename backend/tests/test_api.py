import base64
import os
import re

import pytest

from app import create_app
from app.extensions import db
from app.models import Expense, User


def _key():
    return base64.b64encode(os.urandom(32)).decode()


@pytest.fixture()
def app():
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite://",
        "MASTER_KEY": _key(), "BLIND_INDEX_KEY": _key(), "JWT_SECRET": "x" * 48,
        "MAIL_BACKEND": "memory", "RATELIMIT_ENABLED": False,
    })
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture()
def client(app):
    return app.test_client()


def _otp(app):
    return re.search(r"(\d{6})", app.outbox[-1]["body"]).group(1)


def _signup(client, app, email="a@example.com", pw="correct-horse-9"):
    r = client.post("/api/v1/auth/register", json={"email": email, "password": pw, "name": "Asha"})
    assert r.status_code == 202
    r = client.post("/api/v1/auth/verify-email", json={"email": email, "otp": _otp(app)})
    assert r.status_code == 200
    return r.get_json()


def _auth(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_pii_is_encrypted_at_rest(client, app):
    t = _signup(client, app)
    r = client.post("/api/v1/expenses", headers=_auth(t), json={
        "amount_minor": 45000, "category": "Food & Dining", "expense_date": "2026-10-01",
        "merchant": "Zomato Secret Cafe", "note": "birthday dinner for Riya",
    })
    assert r.status_code == 201
    raw = db.session.execute(db.text("SELECT * FROM expenses")).mappings().first()
    blob = " ".join(str(v) for v in raw.values())
    assert "Zomato" not in blob and "Riya" not in blob and "45000" not in blob
    user = db.session.execute(db.text("SELECT * FROM users")).mappings().first()
    assert "a@example.com" not in " ".join(str(v) for v in user.values()) and "Asha" not in " ".join(str(v) for v in user.values())
    got = client.get("/api/v1/expenses?month=2026-10", headers=_auth(t)).get_json()["items"][0]
    assert got["merchant"] == "Zomato Secret Cafe" and got["amount_minor"] == 45000


def test_ciphertext_cannot_be_swapped_between_rows(client, app):
    t = _signup(client, app)
    for amt in (100, 999900):
        client.post("/api/v1/expenses", headers=_auth(t), json={
            "amount_minor": amt, "category": "Other", "expense_date": "2026-10-01"})
    a, b = Expense.query.order_by(Expense.created_at).all()
    a.amount_enc = b.amount_enc
    db.session.commit()
    with pytest.raises(Exception):
        client.get("/api/v1/expenses", headers=_auth(t))
        user = User.query.first()
        user.dec(a.amount_enc, "expense", a.id, "amount")


def test_users_cannot_see_each_others_expenses(client, app):
    t1 = _signup(client, app, "one@example.com")
    t2 = _signup(client, app, "two@example.com")
    e = client.post("/api/v1/expenses", headers=_auth(t1), json={
        "amount_minor": 500, "category": "Other", "expense_date": "2026-10-02"}).get_json()
    assert client.delete(f"/api/v1/expenses/{e['id']}", headers=_auth(t2)).status_code == 404
    assert client.get("/api/v1/expenses", headers=_auth(t2)).get_json()["items"] == []


def test_login_requires_verification_and_locks_out(client, app):
    client.post("/api/v1/auth/register", json={"email": "b@example.com", "password": "correct-horse-9", "name": "B"})
    r = client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": "correct-horse-9"})
    assert r.status_code == 403
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": "wrong-password"})
    r = client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": "correct-horse-9"})
    assert r.status_code == 429


def test_otp_password_reset_revokes_sessions(client, app):
    t = _signup(client, app)
    assert client.post("/api/v1/auth/password/forgot", json={"email": "a@example.com"}).status_code == 202
    code = _otp(app)
    bad = client.post("/api/v1/auth/password/reset", json={"email": "a@example.com", "otp": "000000", "new_password": "brand-new-pass-1"})
    assert bad.status_code == 400
    ok = client.post("/api/v1/auth/password/reset", json={"email": "a@example.com", "otp": code, "new_password": "brand-new-pass-1"})
    assert ok.status_code == 200
    assert client.get("/api/v1/auth/me", headers=_auth(t)).status_code == 401  # old access token dead
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "brand-new-pass-1"}).status_code == 200


def test_unknown_email_gets_same_forgot_response(client):
    r = client.post("/api/v1/auth/password/forgot", json={"email": "nobody@example.com"})
    assert r.status_code == 202


def test_refresh_rotation_and_reuse_detection(client, app):
    t = _signup(client, app)
    r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]})
    assert r1.status_code == 200
    new = r1.get_json()
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401  # replay
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": new["refresh_token"]}).status_code == 401  # family killed


def test_monthly_report_and_savings(client, app):
    t = _signup(client, app)
    for i in range(12):
        client.post("/api/v1/expenses", headers=_auth(t), json={
            "amount_minor": 20000, "category": "Food & Dining", "expense_date": f"2026-09-{i + 1:02d}", "merchant": "Chai Point"})
    client.post("/api/v1/expenses", headers=_auth(t), json={
        "amount_minor": 800000, "category": "Rent & Housing", "expense_date": "2026-09-01"})
    rep = client.get("/api/v1/reports/monthly?month=2026-09", headers=_auth(t)).get_json()
    assert rep["total_minor"] == 12 * 20000 + 800000
    assert rep["categories"][0]["category"] == "Rent & Housing"
    assert any("food" in s["title"].lower() for s in rep["savings"])


def test_validation_rejects_bad_input_without_echo(client, app):
    t = _signup(client, app)
    r = client.post("/api/v1/expenses", headers=_auth(t), json={
        "amount_minor": -5, "category": "Nope", "expense_date": "2026-10-01", "note": "secret-note"})
    assert r.status_code == 422 and "secret-note" not in r.get_data(as_text=True)


def test_delete_account_removes_everything(client, app):
    t = _signup(client, app)
    client.post("/api/v1/expenses", headers=_auth(t), json={"amount_minor": 100, "category": "Other", "expense_date": "2026-10-01"})
    assert client.delete("/api/v1/auth/me", headers=_auth(t)).status_code == 204
    assert User.query.count() == 0 and Expense.query.count() == 0
