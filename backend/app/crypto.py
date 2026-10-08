"""Envelope encryption for PII.

* Each user gets a random 256-bit data key (DEK).
* The DEK is wrapped (AES-256-GCM) with MASTER_KEY, which lives only in the server
  environment, never in the database. A database leak alone reveals nothing readable.
* Every PII field is AES-256-GCM encrypted with the user's DEK. The authenticated
  data (AAD) binds the ciphertext to its user/row/field, so blobs cannot be swapped.
* Email lookup uses an HMAC "blind index" so the plain email is never stored.
"""
import base64
import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_V = "v1:"


def _b64d(s: str) -> bytes:
    return base64.b64decode(s.encode())


def _b64e(b: bytes) -> str:
    return base64.b64encode(b).decode()


class CryptoService:
    def __init__(self, master_key_b64: str, blind_key_b64: str):
        self._master = _b64d(master_key_b64)
        self._blind = _b64d(blind_key_b64)
        if len(self._master) != 32 or len(self._blind) != 32:
            raise ValueError("MASTER_KEY and BLIND_INDEX_KEY must each be 32 bytes (base64).")

    @staticmethod
    def new_dek() -> bytes:
        return os.urandom(32)

    def wrap_dek(self, dek: bytes, user_id: str) -> str:
        nonce = os.urandom(12)
        ct = AESGCM(self._master).encrypt(nonce, dek, f"dek|{user_id}".encode())
        return _V + _b64e(nonce + ct)

    def unwrap_dek(self, wrapped: str, user_id: str) -> bytes:
        raw = _b64d(wrapped.removeprefix(_V))
        return AESGCM(self._master).decrypt(raw[:12], raw[12:], f"dek|{user_id}".encode())

    @staticmethod
    def encrypt(dek: bytes, plaintext: str, aad: str) -> str:
        nonce = os.urandom(12)
        ct = AESGCM(dek).encrypt(nonce, plaintext.encode(), aad.encode())
        return _V + _b64e(nonce + ct)

    @staticmethod
    def decrypt(dek: bytes, blob: str, aad: str) -> str:
        raw = _b64d(blob.removeprefix(_V))
        return AESGCM(dek).decrypt(raw[:12], raw[12:], aad.encode()).decode()

    def blind_index(self, value: str) -> str:
        return hmac.new(self._blind, value.strip().lower().encode(), hashlib.sha256).hexdigest()
