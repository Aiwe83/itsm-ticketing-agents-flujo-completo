"""Tests de bkt_integration_service_python/api/schemas/issue.py."""

from __future__ import annotations

import pytest

from bkt_integration_service_python.core.errors import AppError
from bkt_integration_service_python.api.schemas.issue import validate_issue_batch

VALID_ISSUE = {
    "id": "10001",
    "key": "BFC-4",
    "fields": {"summary": "Algo paso"},
}


def test_valid_payload_passes():
    body = {"initiatedBy": "bkt-jira-triggers", "issues": [VALID_ISSUE]}

    result = validate_issue_batch(body)

    assert result["initiated_by"] == "bkt-jira-triggers"
    assert result["issues"][0]["key"] == "BFC-4"


def test_extra_fields_pass_through():
    issue = {**VALID_ISSUE, "fields": {**VALID_ISSUE["fields"], "description": "extra", "custom": {"a": 1}}}
    body = {"issues": [issue]}

    result = validate_issue_batch(body)

    assert result["issues"][0]["fields"]["description"] == "extra"
    assert result["issues"][0]["fields"]["custom"] == {"a": 1}


def test_missing_key_rejected():
    issue = {"fields": {"summary": "x"}}
    with pytest.raises(AppError):
        validate_issue_batch({"issues": [issue]})


def test_missing_summary_rejected():
    issue = {"key": "BFC-4", "fields": {}}
    with pytest.raises(AppError):
        validate_issue_batch({"issues": [issue]})


def test_zero_issues_rejected():
    with pytest.raises(AppError):
        validate_issue_batch({"issues": []})


def test_two_issues_rejected():
    with pytest.raises(AppError):
        validate_issue_batch({"issues": [VALID_ISSUE, VALID_ISSUE]})


def test_missing_issues_key_rejected():
    with pytest.raises(AppError):
        validate_issue_batch({})


def test_initiated_by_optional():
    result = validate_issue_batch({"issues": [VALID_ISSUE]})
    assert result["initiated_by"] is None
