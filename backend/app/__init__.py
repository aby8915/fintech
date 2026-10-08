import logging

import click
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config
from .crypto import CryptoService
from .extensions import db, limiter


def create_app(overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if overrides:
        app.config.update(overrides)

    if app.config["APP_ENV"] == "production":
        missing = [k for k in ("MASTER_KEY", "BLIND_INDEX_KEY", "JWT_SECRET", "GOOGLE_CLIENT_IDS") if not app.config[k]]
        if missing or not app.config["SQLALCHEMY_DATABASE_URI"].startswith("postgresql"):
            raise RuntimeError(f"Refusing to start in production; fix config: {missing or 'DATABASE_URL must be PostgreSQL'}")
        if app.config["MAIL_BACKEND"] != "smtp":
            raise RuntimeError("Production requires MAIL_BACKEND=smtp")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)  # behind nginx only
    app.outbox = []
    app.crypto = CryptoService(app.config["MASTER_KEY"], app.config["BLIND_INDEX_KEY"])

    db.init_app(app)
    limiter.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["ALLOWED_ORIGINS"]}},
        allow_headers=["Authorization", "Content-Type"],
        methods=["GET", "POST", "PATCH", "DELETE"],
        max_age=600,
    )

    from . import auth, expenses, reports

    for m in (auth, expenses, reports):
        app.register_blueprint(m.bp)

    @app.get("/api/v1/health")
    @limiter.exempt
    def health():
        db.session.execute(db.text("SELECT 1"))
        return jsonify(status="ok")

    @app.after_request
    def secure_headers(resp):
        resp.headers["Cache-Control"] = "no-store"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return resp

    @app.errorhandler(404)
    def _404(_):
        return jsonify(error="not_found"), 404

    @app.errorhandler(405)
    def _405(_):
        return jsonify(error="method_not_allowed"), 405

    @app.errorhandler(413)
    def _413(_):
        return jsonify(error="payload_too_large"), 413

    @app.errorhandler(429)
    def _429(_):
        return jsonify(error="rate_limited"), 429

    @app.errorhandler(Exception)
    def _500(e):
        from werkzeug.exceptions import HTTPException

        if isinstance(e, HTTPException):
            return jsonify(error=e.name.lower().replace(" ", "_")), e.code
        app.logger.exception("unhandled error")  # stack trace only; request bodies are never logged
        return jsonify(error="server_error"), 500

    @app.cli.command("init-db")
    def init_db():
        db.create_all()
        click.echo("tables ready")

    @app.cli.command("purge-expired")
    def purge_expired():
        from .models import OtpCode, RefreshToken, utcnow

        now = utcnow()
        OtpCode.query.filter(OtpCode.expires_at < now).delete()
        RefreshToken.query.filter(RefreshToken.expires_at < now).delete()
        db.session.commit()
        click.echo("purged")

    return app
