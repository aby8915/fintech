from functools import wraps

import jwt
from flask import current_app, g, jsonify, request
from pydantic import ValidationError

from .extensions import db
from .models import User

JWT_ISS = "paisapilot-api"
JWT_AUD = "paisapilot-app"


def err(status: int, code: str, **extra):
    return jsonify(error=code, **extra), status


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return err(401, "unauthorized")
        try:
            claims = jwt.decode(
                header[7:],
                current_app.config["JWT_SECRET"],
                algorithms=["HS256"],
                audience=JWT_AUD,
                issuer=JWT_ISS,
                options={"require": ["exp", "iat", "sub"]},
            )
        except jwt.PyJWTError:
            return err(401, "unauthorized")
        user = db.session.get(User, claims["sub"])
        if user is None or user.token_version != claims.get("tv"):
            return err(401, "unauthorized")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def validated(model):
    """Parse the JSON body with a pydantic model. Never echoes input back (PII)."""

    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                data = model.model_validate(request.get_json(silent=True) or {})
            except ValidationError as e:
                fields = [{"field": ".".join(map(str, x["loc"])), "msg": x["msg"]} for x in e.errors()]
                return err(422, "validation_error", fields=fields)
            return fn(data, *args, **kwargs)

        return wrapper

    return deco
