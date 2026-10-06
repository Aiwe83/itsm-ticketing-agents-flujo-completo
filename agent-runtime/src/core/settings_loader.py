from __future__ import annotations

import inspect
import os
import re
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from types import UnionType
from typing import (
    Annotated,
    Any,
    ClassVar,
    Mapping,
    Self,
    TypedDict,
    Union,
    cast,
    get_args,
    get_origin,
    get_type_hints,
)

import msgspec
from msgspec import UNSET, Meta, Struct, convert, json


class _SettingsConfig(TypedDict, total=False):
    env_prefix: str
    case_sensitive: bool
    env_nested_delimiter: str | None
    env_file: str | None


class Field:
    """Settings field metadata used to override environment variable names."""

    def __init__(self, *, alias: str | None = None) -> None:
        self.alias = alias


@dataclass(frozen=True, slots=True)
class _FieldSchema:
    name: str
    annotation: Any
    resolved_type: Any
    alias: str | None
    env_names: tuple[str, ...]
    required: bool
    struct_type: type[Struct] | None


@dataclass(frozen=True, slots=True)
class _StructSchema:
    struct_type: type[Struct]
    fields: tuple[_FieldSchema, ...]
    fields_by_name: dict[str, _FieldSchema]
    exact_lookup: dict[str, str]
    normalized_lookup: dict[str, str]


def _compile_struct_schema(struct_type: type[Struct]) -> _StructSchema:
    annotations = _Settings._get_annotations(struct_type)
    field_infos = {field_info.name: field_info for field_info in msgspec.structs.fields(struct_type)}
    fields: list[_FieldSchema] = []
    exact_lookup: dict[str, str] = {}
    normalized_lookup: dict[str, str] = {}

    for field_name, annotation in annotations.items():
        field_info = field_infos.get(field_name)
        if field_info is None:
            continue

        resolved_type = _Settings._unwrap_annotated(annotation)
        alias = _Settings._field_alias(annotation)
        env_names = (alias, field_name) if alias and alias != field_name else (field_name,)
        struct_field_type = _Settings._as_struct_type(resolved_type)
        fields.append(
            _FieldSchema(
                name=field_name,
                annotation=annotation,
                resolved_type=resolved_type,
                alias=alias,
                env_names=env_names,
                required=field_info.required,
                struct_type=struct_field_type,
            )
        )

        exact_lookup.setdefault(field_name, field_name)
        normalized_lookup.setdefault(field_name.lower(), field_name)
        if alias:
            exact_lookup.setdefault(alias, field_name)
            normalized_lookup.setdefault(alias.lower(), field_name)

    return _StructSchema(
        struct_type=struct_type,
        fields=tuple(fields),
        fields_by_name={field.name: field for field in fields},
        exact_lookup=exact_lookup,
        normalized_lookup=normalized_lookup,
    )


@lru_cache(maxsize=None)
def _get_struct_schema(struct_type: type[Struct]) -> _StructSchema:
    return _compile_struct_schema(struct_type)


class CommentedStruct(Struct):
    """Struct that attaches docstring comments to ``msgspec.Meta``."""

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        annotations: dict[str, Any] = getattr(cls, "__annotations__", {})
        comments = cls._field_comments()
        if not comments:
            return

        updated: dict[str, Any] = {}
        for name, annotation in annotations.items():
            if name == "model_config":
                continue
            description = comments.get(name)
            if not description or cls._has_meta_description(annotation):
                continue
            updated[name] = Annotated[annotation, Meta(description=description)]

        if updated:
            annotations.update(updated)
            cls.__annotations__ = annotations

    @classmethod
    def _field_comments(cls) -> dict[str, str]:
        try:
            source = inspect.getsource(cls)
        except OSError:
            return {}
        return cls._parse_field_comments(source)

    @staticmethod
    def _parse_field_comments(source: str) -> dict[str, str]:
        lines = source.splitlines()
        if not lines:
            return {}
        class_indent = len(lines[0]) - len(lines[0].lstrip())
        field_indent = class_indent + 4
        doc_buffer: list[str] = []
        in_doc = False
        comments: dict[str, str] = {}
        for line in lines[1:]:
            if not line.strip():
                doc_buffer = []
                in_doc = False
                continue
            indent = len(line) - len(line.lstrip())
            if indent != field_indent:
                continue
            stripped = line.lstrip()
            if stripped.startswith(('"""', "'''")):
                quote = stripped[:3]
                content = stripped[3:]
                if content.endswith(quote):
                    text = content[:-3].strip()
                    doc_buffer = [text] if text else []
                    in_doc = False
                else:
                    in_doc = True
                    doc_buffer = [content.strip()] if content.strip() else []
                continue
            if in_doc:
                if stripped.endswith(('"""', "'''")):
                    doc_buffer.append(stripped[:-3].strip())
                    in_doc = False
                else:
                    doc_buffer.append(stripped)
                continue
            if stripped.startswith(("def ", "class ", "@")):
                continue
            match = re.match(r"^(\w+)\s*:\s*[^#\n]*(?:#\s*(.+))?$", stripped)
            if not match:
                doc_buffer = []
                continue
            field_name = match.group(1)
            if doc_buffer:
                comments[field_name] = " ".join(part for part in doc_buffer if part).strip()
            doc_buffer = []
        return comments

    @staticmethod
    def _has_meta_description(annotation: Any) -> bool:
        _, metadata = CommentedStruct._iter_annotated_metadata(annotation)
        return any(isinstance(meta, Meta) and meta.description for meta in metadata)

    @staticmethod
    def _iter_annotated_metadata(annotation: Any) -> tuple[Any, list[Any]]:
        metadata: list[Any] = []
        current = annotation
        while get_origin(current) is Annotated:
            args = get_args(current)
            current = args[0]
            metadata.extend(args[1:])
        return current, metadata


class _Settings(CommentedStruct, kw_only=True):
    model_config: ClassVar[_SettingsConfig]

    @classmethod
    def load(
        cls,
        *,
        env: Mapping[str, str] | None = None,
        overrides: Mapping[str, Any] | None = None,
    ) -> Self:
        config = cast(_SettingsConfig, getattr(cls, "model_config", {}))
        schema = _get_struct_schema(cls)
        env_map = cls._build_env_map(
            env=env,
            env_file=config.get("env_file"),
            case_sensitive=config.get("case_sensitive", False),
        )
        data = dict(overrides or {})
        nested_delimiter = config.get("env_nested_delimiter")
        case_sensitive = config.get("case_sensitive", False)
        env_prefix = config.get("env_prefix", "")

        if nested_delimiter:
            cls._apply_nested_env(
                env_map=env_map,
                data=data,
                schema=schema,
                env_prefix=env_prefix,
                nested_delimiter=nested_delimiter,
                case_sensitive=case_sensitive,
            )
            cls._apply_nested_alias_env(
                env_map=env_map,
                data=data,
                schema=schema,
                env_prefix=env_prefix,
                case_sensitive=case_sensitive,
            )
            cls._coerce_nested_structs(data, schema)

        for field_schema in schema.fields:
            if field_schema.name in data:
                continue

            for env_name in field_schema.env_names:
                env_key = cls._format_env_key(env_prefix, env_name, case_sensitive)
                raw = env_map.get(env_key)
                if raw is None:
                    continue
                data[field_schema.name] = cls._coerce_value(raw, field_schema.resolved_type)
                break
            else:
                if not field_schema.required:
                    continue
                implicit_default = cls._build_implicit_struct_default(field_schema.resolved_type)
                if implicit_default is not UNSET:
                    data[field_schema.name] = implicit_default
                    continue
                env_key = cls._format_env_key(env_prefix, field_schema.env_names[0], case_sensitive)
                raise ValueError(f"Missing required setting: {env_key}")

        return convert(data, type=cls)

    @staticmethod
    def _build_implicit_struct_default(field_type: Any) -> Any:
        resolved_type = _Settings._unwrap_annotated(field_type)
        if get_origin(resolved_type) in {Union, UnionType} and type(None) in get_args(resolved_type):
            return UNSET

        struct_type = _Settings._as_struct_type(resolved_type)
        if struct_type is None:
            return UNSET

        try:
            return struct_type()
        except Exception:
            return UNSET

    @staticmethod
    def _format_env_key(prefix: str, field_name: str, case_sensitive: bool) -> str:
        key = f"{prefix}{field_name}"
        return key if case_sensitive else key.upper()

    @staticmethod
    def _field_alias(annotation: Any) -> str | None:
        _, metadata = CommentedStruct._iter_annotated_metadata(annotation)
        for meta in metadata:
            if isinstance(meta, Field) and meta.alias:
                return meta.alias
        return None

    @staticmethod
    def _resolve_struct_field_name(
        env_name: str,
        struct_schema: _StructSchema | None,
        case_sensitive: bool,
    ) -> str:
        if struct_schema is None:
            return env_name if case_sensitive else env_name.lower()
        if case_sensitive:
            return struct_schema.exact_lookup.get(env_name, env_name)
        return struct_schema.normalized_lookup.get(env_name.lower(), env_name.lower())

    @staticmethod
    def _apply_nested_env(
        env_map: Mapping[str, str],
        data: dict[str, Any],
        schema: _StructSchema,
        env_prefix: str,
        nested_delimiter: str,
        case_sensitive: bool,
    ) -> None:
        prefix = env_prefix if case_sensitive else env_prefix.upper()
        for key, value in env_map.items():
            if prefix and not key.startswith(prefix):
                continue
            stripped = key[len(prefix) :] if prefix else key
            if nested_delimiter not in stripped:
                continue
            _Settings._set_nested(
                data=data,
                struct_schema=schema,
                parts=stripped.split(nested_delimiter),
                value=value,
                case_sensitive=case_sensitive,
            )

    @staticmethod
    def _set_nested(
        data: dict[str, Any],
        struct_schema: _StructSchema,
        parts: list[str],
        value: str,
        case_sensitive: bool,
    ) -> None:
        current: dict[str, Any] = data
        current_schema: _StructSchema | None = struct_schema
        for part in parts[:-1]:
            resolved_part = _Settings._resolve_struct_field_name(part, current_schema, case_sensitive)
            key = resolved_part if case_sensitive else resolved_part.lower()
            next_value = current.get(key)
            if not isinstance(next_value, dict):
                next_value = {}
                current[key] = next_value
            current = next_value

            field_schema = None if current_schema is None else current_schema.fields_by_name.get(resolved_part)
            current_schema = (
                _get_struct_schema(field_schema.struct_type)
                if field_schema is not None and field_schema.struct_type is not None
                else None
            )

        final_part = _Settings._resolve_struct_field_name(parts[-1], current_schema, case_sensitive)
        current[final_part if case_sensitive else final_part.lower()] = value

    @staticmethod
    def _coerce_nested_structs(data: dict[str, Any], struct_schema: _StructSchema) -> None:
        for field_schema in struct_schema.fields:
            if field_schema.name not in data:
                continue
            raw_value = data[field_schema.name]
            if isinstance(raw_value, dict) and field_schema.struct_type is not None:
                data[field_schema.name] = _Settings._coerce_struct_data(
                    raw=raw_value,
                    struct_schema=_get_struct_schema(field_schema.struct_type),
                )
            elif isinstance(raw_value, str):
                data[field_schema.name] = _Settings._coerce_value(raw_value, field_schema.resolved_type)

    @staticmethod
    def _coerce_struct_data(raw: dict[str, Any], struct_schema: _StructSchema) -> Any:
        data: dict[str, Any] = {}
        for field_schema in struct_schema.fields:
            raw_value = _Settings._extract_raw_field_value(raw, field_schema)
            if raw_value is UNSET:
                continue
            if isinstance(raw_value, dict) and field_schema.struct_type is not None:
                data[field_schema.name] = _Settings._coerce_struct_data(
                    raw=raw_value,
                    struct_schema=_get_struct_schema(field_schema.struct_type),
                )
            elif isinstance(raw_value, str):
                data[field_schema.name] = _Settings._coerce_value(raw_value, field_schema.resolved_type)
            else:
                data[field_schema.name] = raw_value
        return convert(data, type=struct_schema.struct_type)

    @staticmethod
    def _as_struct_type(field_type: Any) -> type[Struct] | None:
        resolved_type = _Settings._unwrap_annotated(field_type)
        if get_origin(resolved_type) in {Union, UnionType}:
            resolved_type = next(
                (arg for arg in get_args(resolved_type) if arg is not type(None)),
                resolved_type,
            )
        if not (isinstance(resolved_type, type) and issubclass(resolved_type, Struct)):
            return None
        return cast(type[Struct], resolved_type)

    @staticmethod
    def _extract_raw_field_value(raw: dict[str, Any], field_schema: _FieldSchema) -> Any:
        if field_schema.name in raw:
            return raw[field_schema.name]
        if field_schema.alias is None:
            return UNSET
        for key in (field_schema.alias, field_schema.alias.lower(), field_schema.alias.upper()):
            if key in raw:
                return raw[key]
        return UNSET

    @staticmethod
    def _apply_nested_alias_env(
        env_map: Mapping[str, str],
        data: dict[str, Any],
        schema: _StructSchema,
        env_prefix: str,
        case_sensitive: bool,
    ) -> None:
        for field_schema in schema.fields:
            if field_schema.struct_type is None:
                continue
            nested_data = data.get(field_schema.name)
            raw_nested = nested_data if isinstance(nested_data, dict) else {}
            _Settings._apply_struct_alias_env(
                env_map=env_map,
                data=raw_nested,
                struct_schema=_get_struct_schema(field_schema.struct_type),
                env_prefix=env_prefix,
                case_sensitive=case_sensitive,
            )
            if raw_nested:
                data[field_schema.name] = raw_nested

    @staticmethod
    def _apply_struct_alias_env(
        env_map: Mapping[str, str],
        data: dict[str, Any],
        struct_schema: _StructSchema,
        env_prefix: str,
        case_sensitive: bool,
    ) -> None:
        for field_schema in struct_schema.fields:
            if field_schema.struct_type is not None:
                nested_data = data.get(field_schema.name)
                raw_nested = nested_data if isinstance(nested_data, dict) else {}
                _Settings._apply_struct_alias_env(
                    env_map=env_map,
                    data=raw_nested,
                    struct_schema=_get_struct_schema(field_schema.struct_type),
                    env_prefix=env_prefix,
                    case_sensitive=case_sensitive,
                )
                if raw_nested:
                    data[field_schema.name] = raw_nested
                continue

            if field_schema.name in data or not field_schema.alias:
                continue
            env_key = _Settings._format_env_key(env_prefix, field_schema.alias, case_sensitive)
            raw = env_map.get(env_key)
            if raw is None:
                continue
            data[field_schema.name] = _Settings._coerce_value(raw, field_schema.resolved_type)

    @staticmethod
    def _build_env_map(
        env: Mapping[str, str] | None,
        env_file: str | None,
        case_sensitive: bool,
    ) -> dict[str, str]:
        merged: dict[str, str] = {}
        # An explicit env mapping is treated as the full settings source. This keeps
        # tests deterministic and avoids leaking local .env values into controlled loads.
        if env is None and env_file:
            merged.update(_Settings._parse_env_file(env_file))
        merged.update(os.environ if env is None else env)
        if case_sensitive:
            return merged
        return {key.upper(): value for key, value in merged.items()}

    @staticmethod
    def _parse_env_file(path: str) -> dict[str, str]:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                lines = handle.readlines()
        except FileNotFoundError:
            return {}

        data: dict[str, str] = {}
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            data[key.strip()] = _Settings._strip_quotes(value.strip())
        return data

    @staticmethod
    def _strip_quotes(value: str) -> str:
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            return value[1:-1]
        return value

    @staticmethod
    def _coerce_value(raw: str, target_type: Any) -> Any:
        resolved_type = _Settings._unwrap_annotated(target_type)
        origin = get_origin(resolved_type)
        args = get_args(resolved_type)

        if resolved_type in {Any, str}:
            return raw
        if resolved_type is bool:
            return _Settings._parse_bool(raw)
        if resolved_type is int:
            return int(raw)
        if resolved_type is float:
            return float(raw)

        if isinstance(resolved_type, type) and issubclass(resolved_type, Enum):
            try:
                return resolved_type[raw]
            except KeyError:
                return resolved_type(raw)

        if isinstance(resolved_type, type) and issubclass(resolved_type, Struct):
            return json.decode(raw.encode("utf-8"), type=resolved_type)

        if origin in {list, dict, tuple, set}:
            return json.decode(raw.encode("utf-8"), type=resolved_type)

        if origin in {Union, UnionType} and type(None) in args:
            non_null = next(arg for arg in args if arg is not type(None))
            return _Settings._coerce_value(raw, non_null)

        try:
            return json.decode(raw.encode("utf-8"), type=resolved_type)
        except Exception:
            return raw

    @staticmethod
    def _parse_bool(raw: str) -> bool:
        normalized = raw.strip().lower()
        if normalized in {"1", "true", "t", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "f", "no", "n", "off"}:
            return False
        raise ValueError(f"Invalid boolean value: {raw}")

    @staticmethod
    def _unwrap_annotated(annotation: Any) -> Any:
        base_annotation, _ = CommentedStruct._iter_annotated_metadata(annotation)
        return base_annotation

    @staticmethod
    def _get_annotations(struct_type: type) -> dict[str, Any]:
        try:
            return get_type_hints(struct_type, include_extras=True)
        except TypeError:
            return get_type_hints(struct_type)
        except Exception:
            return getattr(struct_type, "__annotations__", {})
