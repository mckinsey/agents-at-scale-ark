from __future__ import annotations

import json
from typing import Any

JSON_SCHEMA_TYPES = frozenset(
    {"string", "number", "integer", "boolean", "object", "array", "null"}
)
SUBSCHEMA_KEYWORDS = ("items", "additionalProperties", "not")
SUBSCHEMA_LIST_KEYWORDS = ("anyOf", "allOf", "oneOf", "prefixItems")
SUBSCHEMA_MAP_KEYWORDS = ("properties", "$defs", "definitions")

EMPTY_MESSAGE = "The schema must not be empty."
INVALID_JSON_MESSAGE = "Enter valid JSON."
NOT_OBJECT_MESSAGE = "The schema must be a JSON object."
ROOT_TYPE_MESSAGE = 'The root schema must have "type": "object".'


def _find_type_error(schema_type: Any, path: str) -> str | None:
    types = schema_type if isinstance(schema_type, list) else [schema_type]
    for entry in types:
        if not isinstance(entry, str) or entry not in JSON_SCHEMA_TYPES:
            return f"Unknown type {json.dumps(entry)} at {path}."
    return None


def _find_list_error(schema: dict[str, Any], path: str) -> str | None:
    for keyword in SUBSCHEMA_LIST_KEYWORDS:
        if keyword not in schema:
            continue
        entries = schema[keyword]
        if not isinstance(entries, list):
            return f'"{keyword}" at {path} must be an array.'
        for index, entry in enumerate(entries):
            error = _find_subschema_error(entry, f"{path}.{keyword}[{index}]")
            if error:
                return error
    return None


def _find_map_error(schema: dict[str, Any], path: str) -> str | None:
    for keyword in SUBSCHEMA_MAP_KEYWORDS:
        if keyword not in schema:
            continue
        entries = schema[keyword]
        if not isinstance(entries, dict):
            return f'"{keyword}" at {path} must be an object.'
        for name, entry in entries.items():
            error = _find_subschema_error(entry, f"{path}.{keyword}.{name}")
            if error:
                return error
    return None


def _find_subschema_error(schema: Any, path: str) -> str | None:
    if isinstance(schema, bool):
        return None
    if not isinstance(schema, dict):
        return f"The schema at {path} must be a JSON object."
    if "type" in schema:
        error = _find_type_error(schema["type"], path)
        if error:
            return error
    for keyword in SUBSCHEMA_KEYWORDS:
        if keyword in schema:
            error = _find_subschema_error(schema[keyword], f"{path}.{keyword}")
            if error:
                return error
    return _find_list_error(schema, path) or _find_map_error(schema, path)


def validate_output_schema(value: str) -> str | None:
    """Return an error message when value is not a usable output schema, else None.

    Mirrors the dashboard check: valid JSON, an object root with "type": "object",
    and known "type" values at every depth. Not a full JSON Schema validation.
    """
    if not value.strip():
        return EMPTY_MESSAGE
    try:
        parsed = json.loads(value)
    except ValueError:
        return INVALID_JSON_MESSAGE
    if not isinstance(parsed, dict):
        return NOT_OBJECT_MESSAGE
    if parsed.get("type") != "object":
        return ROOT_TYPE_MESSAGE
    return _find_subschema_error(parsed, "root")
