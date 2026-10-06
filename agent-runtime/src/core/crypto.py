from __future__ import annotations

import base64
import hashlib

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad


def aes_encrypt(plaintext: str, key: str, *, iv: bytes | None = None) -> str:
    digest = hashlib.sha256(key.encode()).digest()
    resolved_iv = iv or digest[: AES.block_size]
    cipher = AES.new(digest, AES.MODE_CBC, resolved_iv)
    encrypted = cipher.encrypt(pad(plaintext.encode("utf-8"), AES.block_size))
    return base64.b64encode(resolved_iv + encrypted).decode("utf-8")


def aes_decrypt(ciphertext: str, key: str) -> str:
    digest = hashlib.sha256(key.encode()).digest()
    encrypted_bytes = base64.b64decode(ciphertext)
    iv = encrypted_bytes[: AES.block_size]
    payload = encrypted_bytes[AES.block_size :]
    cipher = AES.new(digest, AES.MODE_CBC, iv)
    decrypted = unpad(cipher.decrypt(payload), AES.block_size)
    return decrypted.decode("utf-8")
