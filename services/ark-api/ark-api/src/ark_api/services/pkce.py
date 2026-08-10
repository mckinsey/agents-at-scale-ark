"""PKCE primitives per RFC 7636 S256.

Used by the MCP auth endpoints. The verifier is never persisted and never
leaves ark-api memory.
"""
from __future__ import annotations

import base64
import hashlib
import secrets
import string

VERIFIER_ALPHABET = string.ascii_letters + string.digits + "-._~"
DEFAULT_VERIFIER_LENGTH = 64
MIN_VERIFIER_LENGTH = 43
MAX_VERIFIER_LENGTH = 128
STATE_BYTES = 16


def generate_verifier(length: int = DEFAULT_VERIFIER_LENGTH) -> str:
    if not (MIN_VERIFIER_LENGTH <= length <= MAX_VERIFIER_LENGTH):
        raise ValueError(
            f"PKCE verifier length must be between {MIN_VERIFIER_LENGTH} and {MAX_VERIFIER_LENGTH}"
        )
    return "".join(secrets.choice(VERIFIER_ALPHABET) for _ in range(length))


def derive_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def generate_state() -> str:
    return secrets.token_urlsafe(STATE_BYTES)


def generate_auth_id() -> str:
    return secrets.token_urlsafe(STATE_BYTES)
