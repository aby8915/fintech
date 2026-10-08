from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
# One gunicorn worker + threads (see deploy/paisapilot.service) keeps these in-memory
# counters consistent. Point RATELIMIT_STORAGE_URI at Redis if you ever add workers.
limiter = Limiter(key_func=get_remote_address, default_limits=["300/hour"])
