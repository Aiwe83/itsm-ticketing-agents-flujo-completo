"""Tests del motor de mappings (bkt_integration_service_python/domain/mappings.py), equivalente a la
cobertura de src/__tests__/mapping-catalog.service.test.ts para la parte de
transformIssuePayload/getValueByPath/setValueByPath."""

from __future__ import annotations

import pytest

from bkt_integration_service_python.domain.mappings import MappingValidationError, transform_issue_payload
from bkt_integration_service_python.domain.models import Mapping

MESH_ID = "mesh-test"


def _mapping(source: str, target: str, *, required: bool = False, transformer: str = "copy", options=None) -> Mapping:
    return Mapping(
        id="m1",
        source_field=source,
        target_field=target,
        required=required,
        mesh_id=MESH_ID,
        transformer=transformer,
        options=options or {},
    )


def test_copy_simple_field():
    payload = {"key": "BFC-4", "fields": {"summary": "hola"}}
    mappings = [_mapping("fields.summary", "content.title")]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    assert result.content["title"] == "hola"


def test_copy_nested_target_path():
    payload = {"fields": {"summary": "x", "priority": {"name": "High"}}}
    mappings = [_mapping("fields.priority.name", "content.technicianInfo.email")]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    assert result.content["technicianInfo"]["email"] == "High"


def test_array_wildcard_source_returns_whole_array():
    payload = {"fields": {"components": [{"name": "APP-A"}, {"name": "APP-B"}]}}
    mappings = [_mapping("fields.components[*]", "content.actions[*]")]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    assert result.content["actions"] == [{"name": "APP-A"}, {"name": "APP-B"}]


def test_array_index_source():
    payload = {"fields": {"components": [{"name": "APP-A"}, {"name": "APP-B"}]}}
    mappings = [_mapping("fields.components[1].name", "content.title")]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    assert result.content["title"] == "APP-B"


def test_array_target_appends_instead_of_overwrite():
    payload = {"fields": {"labels": ["a", "b"]}}
    mappings = [_mapping("fields.labels[*]", "content.actions[*]")]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    assert result.content["actions"] == ["a", "b"]


def test_map_to_string_transformer():
    payload = {"fields": {"components": [{"id": "APP-A", "name": "Plataforma"}]}}
    mappings = [
        _mapping(
            "fields.components",
            "content.generalAnnotation",
            transformer="mapToString",
            options={"transformer": {"id": "ID", "name": "Nombre"}},
        )
    ]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    assert result.content["generalAnnotation"] == ["ID: APP-A\nNombre: Plataforma\n"]


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("critical", "1"),
        ("High", "2"),
        ("Medium", "3"),
        ("minor", "4"),
        (2, "2"),
        ("unmapped-value", "unmapped-value"),
        (None, None),
    ],
)
def test_severity_transformer(raw, expected):
    payload = {"fields": {"priority": {"name": raw}}}
    mappings = [_mapping("fields.priority.name", "content.severityLevel", transformer="severity")]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    if expected is None:
        # Valor vacio y mapping opcional: el campo ni se crea en content.
        assert "severityLevel" not in result.content
    else:
        assert result.content["severityLevel"] == expected


def test_missing_optional_value_is_skipped_silently():
    payload = {"fields": {}}
    mappings = [_mapping("fields.description", "content.issueDescription", required=False)]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    # content ya no trae campos fijos por defecto: si no hay valor y el
    # mapping es opcional, el campo simplemente no se crea.
    assert "issueDescription" not in result.content


def test_missing_required_value_raises():
    payload = {"fields": {}}
    mappings = [_mapping("fields.description", "content.issueDescription", required=True)]

    with pytest.raises(MappingValidationError):
        transform_issue_payload(payload, mappings, MESH_ID)


def test_key_and_issue_type_map_into_content():
    payload = {"key": "BFC-9", "fields": {"issuetype": {"name": "Tarea"}}}
    mappings = [
        _mapping("key", "content.key"),
        _mapping("fields.issuetype.name", "content.issueType"),
    ]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    assert result.content["key"] == "BFC-9"
    assert result.content["issueType"] == "Tarea"


def test_unknown_source_path_returns_none_and_is_skipped():
    payload = {"fields": {"summary": "x"}}
    mappings = [_mapping("fields.nope.nope", "content.title")]

    result = transform_issue_payload(payload, mappings, MESH_ID)

    assert "title" not in result.content
