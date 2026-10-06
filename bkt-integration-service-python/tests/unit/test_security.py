"""Tests de bkt_integration_service_python/core/security.py."""

from __future__ import annotations

from bkt_integration_service_python.core.security import is_valid_api_key


def test_valid_key_matches():
    assert is_valid_api_key("secret-123", "secret-123") is True


def test_wrong_key_does_not_match():
    assert is_valid_api_key("wrong", "secret-123") is False


def test_missing_key_does_not_match():
    assert is_valid_api_key(None, "secret-123") is False


def test_empty_key_does_not_match():
    assert is_valid_api_key("", "secret-123") is False


def test_different_length_keys_do_not_crash_or_leak_timing_shortcut():
    # El punto de hashear antes de comparar es que una clave de longitud
    # distinta no provoque una salida distinta antes de tiempo.
    assert is_valid_api_key("short", "a-much-longer-secret-key-value") is False
