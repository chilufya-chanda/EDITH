"""
Encryption at rest for sensitive fields. Face embeddings are biometric
data — storing them as plaintext JSON in the database means anyone with
read access to the database file/dump gets usable biometric vectors
directly. This encrypts that field at the application layer using Fernet
(AES-128 in CBC mode + HMAC for authentication, from the `cryptography`
package) before it's ever written to a row, so a raw database file or
backup is unreadable without the separate encryption key.

The key is NOT stored in the database — only in the environment
(EDITH_ENCRYPTION_KEY), matching the same principle as the JWT secret:
the thing that unlocks the data lives somewhere other than the data
itself.
"""

import base64
import os
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

settings = get_settings()

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.ENCRYPTION_KEY
        _fernet = Fernet(key.encode("utf-8") if isinstance(key, str) else key)
    return _fernet


def encrypt_text(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_text(ciphertext: str) -> str:
    try:
        return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Only reachable if EDITH_ENCRYPTION_KEY changed since data was
        # written, or the value predates encryption being enabled at all.
        raise ValueError(
            "Could not decrypt stored data — EDITH_ENCRYPTION_KEY does not "
            "match the key this data was encrypted with."
        )


def encrypt_image(image_bytes: bytes) -> str:
    """
    Encrypts raw image bytes (JPEG) for storage in a Text column. Used for
    enrollment photos and matched frames kept specifically for human
    review — same encryption-at-rest guarantee as face embeddings.
    """
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return _get_fernet().encrypt(b64.encode("utf-8")).decode("utf-8")


def decrypt_image(ciphertext: str) -> bytes:
    try:
        b64 = _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
        return base64.b64decode(b64)
    except InvalidToken:
        raise ValueError(
            "Could not decrypt stored image — EDITH_ENCRYPTION_KEY does not "
            "match the key this data was encrypted with."
        )


def generate_key() -> str:
    """Used once, manually, to produce a real key for EDITH_ENCRYPTION_KEY — not called at runtime."""
    return Fernet.generate_key().decode("utf-8")
