import json
from dataclasses import dataclass
from typing import Any, TypeGuard

A2A_WIRE_VERSION_V03 = "v0.3"
A2A_WIRE_VERSION_V1RC = "v1rc"
DEFAULT_A2A_WIRE_VERSION = A2A_WIRE_VERSION_V03


@dataclass
class QueryPayload:
    query_type: str
    input_data: str | list[dict[str, Any]]
    preview_text: str


def _is_dict(value: object) -> TypeGuard[dict[str, Any]]:
    return isinstance(value, dict)


def _is_list(value: object) -> TypeGuard[list[Any]]:
    return isinstance(value, list)


def _to_dict(value: Any) -> Any:
    if value is None:
        return None
    if _is_dict(value):
        return value
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump(exclude_none=True)
        except TypeError:
            return value.model_dump()
    if hasattr(value, "dict"):
        try:
            return value.dict(exclude_none=True)
        except TypeError:
            return value.dict()
    if hasattr(value, "__dict__"):
        return value.__dict__
    return value


def _extract_part_value(part: Any, key: str) -> Any:
    if _is_dict(part):
        return part.get(key)
    return getattr(part, key, None)


def normalize_a2a_wire_version(value: str | None) -> str:
    if not isinstance(value, str):
        return DEFAULT_A2A_WIRE_VERSION
    lowered = value.strip().lower().replace("_", "").replace("-", "")
    if lowered in {"v03", "03", "0.3", "v0.3"}:
        return A2A_WIRE_VERSION_V03
    if lowered in {"v1", "v10", "1.0", "v1rc", "1.0rc", "v1.0rc"}:
        return A2A_WIRE_VERSION_V1RC
    return DEFAULT_A2A_WIRE_VERSION


def _first_string(values: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = values.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _extract_file_payload(part_dict: dict[str, Any]) -> dict[str, Any]:
    file_payload: dict[str, Any] = {}

    direct_url = _first_string(part_dict, ("url", "uri"))
    if direct_url:
        file_payload["url"] = direct_url

    direct_raw = part_dict.get("raw")
    if isinstance(direct_raw, str) and direct_raw:
        file_payload["raw"] = direct_raw

    direct_bytes = part_dict.get("bytes")
    if isinstance(direct_bytes, str) and direct_bytes:
        file_payload["raw"] = direct_bytes

    file_value = part_dict.get("file")
    if _is_dict(file_value):
        nested_url = _first_string(file_value, ("uri", "url", "fileWithUri"))
        if nested_url:
            file_payload["url"] = nested_url

        nested_raw = _first_string(file_value, ("bytes", "raw", "fileWithBytes"))
        if nested_raw:
            file_payload["raw"] = nested_raw

        nested_media_type = _first_string(file_value, ("mediaType", "mimeType", "mime_type"))
        if nested_media_type:
            file_payload["mediaType"] = nested_media_type
        nested_filename = _first_string(file_value, ("filename", "name"))
        if nested_filename:
            file_payload["filename"] = nested_filename

    media_type = _first_string(part_dict, ("mediaType", "mimeType", "mime_type"))
    if media_type:
        file_payload["mediaType"] = media_type
    filename = _first_string(part_dict, ("filename", "name"))
    if filename:
        file_payload["filename"] = filename

    return file_payload


def _canonicalize_part(part: Any) -> dict[str, Any] | None:
    part_dict = _to_dict(part)
    if not _is_dict(part_dict):
        return None

    part_type = part_dict.get("type")
    if part_type == "text":
        text_value = part_dict.get("text")
        if isinstance(text_value, str):
            return {"kind": "text", "text": text_value}
        return None
    if part_type == "image_url":
        image_url = part_dict.get("image_url")
        if _is_dict(image_url):
            url_value = image_url.get("url")
            if isinstance(url_value, str) and url_value:
                return {"kind": "file", "url": url_value, "mediaType": "image/*"}
        return None

    kind = part_dict.get("kind")
    if isinstance(kind, str):
        if kind == "text":
            text_value = part_dict.get("text")
            if isinstance(text_value, str):
                return {"kind": "text", "text": text_value}
            if text_value is None:
                return {"kind": "text", "text": ""}
            return {"kind": "text", "text": json.dumps(text_value)}
        if kind == "data":
            data_value = part_dict.get("data")
            if data_value is not None:
                result = {"kind": "data", "data": data_value}
                media_type = _first_string(part_dict, ("mediaType", "mimeType", "mime_type"))
                if media_type:
                    result["mediaType"] = media_type
                return result
            return None
        if kind == "file":
            file_payload = _extract_file_payload(part_dict)
            if file_payload.get("url") or file_payload.get("raw"):
                return {"kind": "file", **file_payload}
            return None

    text_value = part_dict.get("text")
    if isinstance(text_value, str):
        result = {"kind": "text", "text": text_value}
        media_type = _first_string(part_dict, ("mediaType", "mimeType", "mime_type"))
        if media_type:
            result["mediaType"] = media_type
        filename = _first_string(part_dict, ("filename", "name"))
        if filename:
            result["filename"] = filename
        return result

    file_payload = _extract_file_payload(part_dict)
    if file_payload.get("url") or file_payload.get("raw"):
        return {"kind": "file", **file_payload}

    data_value = part_dict.get("data")
    if data_value is not None:
        result = {"kind": "data", "data": data_value}
        media_type = _first_string(part_dict, ("mediaType", "mimeType", "mime_type"))
        if media_type:
            result["mediaType"] = media_type
        return result

    return None


def _extract_message_parts(message: Any) -> list[dict[str, Any]]:
    message_dict = _to_dict(message)
    raw_parts: list[Any] = []
    if _is_dict(message_dict):
        maybe_parts = message_dict.get("parts", [])
        if _is_list(maybe_parts):
            raw_parts = maybe_parts
    else:
        maybe_parts = getattr(message, "parts", None)
        if _is_list(maybe_parts):
            raw_parts = maybe_parts

    canonical_parts: list[dict[str, Any]] = []
    for raw_part in raw_parts:
        part_root = _extract_part_value(raw_part, "root") or raw_part
        normalized = _canonicalize_part(part_root)
        if normalized:
            canonical_parts.append(normalized)
    return canonical_parts


def _canonical_file_url(part_dict: dict[str, Any]) -> str | None:
    url = part_dict.get("url")
    if isinstance(url, str) and url:
        return url
    raw = part_dict.get("raw")
    if isinstance(raw, str) and raw:
        media_type = part_dict.get("mediaType")
        if isinstance(media_type, str) and media_type:
            return f"data:{media_type};base64,{raw}"
        return f"data:application/octet-stream;base64,{raw}"
    return None


def _extract_text_from_part(part: Any) -> str | None:
    canonical = _canonicalize_part(part)
    if not _is_dict(canonical):
        return None

    if canonical.get("kind") == "text":
        text = canonical.get("text")
        if isinstance(text, str) and text:
            return text

    data_value = canonical.get("data")
    if data_value is not None:
        return data_value if isinstance(data_value, str) else json.dumps(data_value)

    file_url = _canonical_file_url(canonical)
    if file_url:
        return file_url

    return None


def extract_text_from_message(message: Any) -> str:
    if message is None:
        return "No message"

    for part in _extract_message_parts(message):
        text = _extract_text_from_part(part)
        if text:
            return text

    return "No message"


def _normalize_role(role: str | None) -> str:
    if role == "agent":
        return "assistant"
    if role in {"user", "assistant", "system", "tool"}:
        return role
    return "user"


def a2a_message_to_openai_message(message: Any) -> dict[str, Any]:
    message_dict = _to_dict(message)
    role = _normalize_role(_extract_part_value(message_dict, "role") if _is_dict(message_dict) else None)

    content_parts: list[dict[str, Any]] = []
    for part_dict in _extract_message_parts(message):
        kind = part_dict.get("kind")
        if kind == "text":
            text = part_dict.get("text")
            if isinstance(text, str) and text:
                content_parts.append({"type": "text", "text": text})
            continue
        if kind == "data":
            data_value = part_dict.get("data")
            if data_value is not None:
                text_value = data_value if isinstance(data_value, str) else json.dumps(data_value)
                content_parts.append({"type": "text", "text": text_value})
            continue
        if kind == "file":
            url = _canonical_file_url(part_dict)
            media_type = part_dict.get("mediaType")
            if isinstance(url, str) and url:
                if isinstance(media_type, str) and media_type.startswith("image/"):
                    content_parts.append({"type": "image_url", "image_url": {"url": url}})
                elif url.startswith("data:image/"):
                    content_parts.append({"type": "image_url", "image_url": {"url": url}})
                else:
                    content_parts.append({"type": "text", "text": url})

    if not content_parts:
        fallback_text = extract_text_from_message(message)
        if fallback_text == "No message":
            fallback_text = ""
        content: str | list[dict[str, Any]] = fallback_text
    elif len(content_parts) == 1 and content_parts[0].get("type") == "text":
        content = content_parts[0]["text"]
    else:
        content = content_parts

    return {"role": role, "content": content}


def _serialize_canonical_part(part: dict[str, Any], wire_version: str) -> dict[str, Any]:
    kind = part.get("kind")
    media_type = part.get("mediaType")
    filename = part.get("filename")
    if wire_version == A2A_WIRE_VERSION_V1RC:
        if kind == "text":
            result = {"text": part.get("text", "")}
            if isinstance(media_type, str) and media_type:
                result["mediaType"] = media_type
            if isinstance(filename, str) and filename:
                result["filename"] = filename
            return result
        if kind == "data":
            result = {"data": part.get("data")}
            if isinstance(media_type, str) and media_type:
                result["mediaType"] = media_type
            return result
        if kind == "file":
            if isinstance(part.get("url"), str) and part.get("url"):
                result = {"url": part.get("url")}
            else:
                result = {"raw": part.get("raw")}
            if isinstance(media_type, str) and media_type:
                result["mediaType"] = media_type
            if isinstance(filename, str) and filename:
                result["filename"] = filename
            return result

    if kind == "text":
        return {"kind": "text", "text": part.get("text", "")}
    if kind == "data":
        result = {"kind": "data", "data": part.get("data")}
        if isinstance(media_type, str) and media_type:
            result["mediaType"] = media_type
        return result
    file_payload: dict[str, Any] = {}
    if isinstance(part.get("url"), str) and part.get("url"):
        file_payload["uri"] = part["url"]
    if isinstance(part.get("raw"), str) and part.get("raw"):
        file_payload["bytes"] = part["raw"]
    result = {"kind": "file", "file": file_payload}
    if isinstance(media_type, str) and media_type:
        result["mediaType"] = media_type
    if isinstance(filename, str) and filename:
        result["filename"] = filename
    return result


def a2a_message_to_native_message(message: Any, wire_version: str = DEFAULT_A2A_WIRE_VERSION) -> dict[str, Any]:
    resolved_wire_version = normalize_a2a_wire_version(wire_version)
    message_dict = _to_dict(message)
    role = "user"
    if _is_dict(message_dict):
        raw_role = message_dict.get("role")
        if isinstance(raw_role, str) and raw_role:
            role = raw_role
    elif hasattr(message, "role"):
        raw_role = getattr(message, "role")
        if isinstance(raw_role, str) and raw_role:
            role = raw_role

    canonical_parts = _extract_message_parts(message)
    serialized_parts: list[dict[str, Any]] = []
    for part in canonical_parts:
        serialized_parts.append(_serialize_canonical_part(part, resolved_wire_version))

    if not serialized_parts:
        fallback_text = extract_text_from_message(message)
        if fallback_text == "No message":
            fallback_text = ""
        serialized_parts = [_serialize_canonical_part({"kind": "text", "text": fallback_text}, resolved_wire_version)]

    native_message: dict[str, Any] = {"role": role, "parts": serialized_parts}
    if _is_dict(message_dict):
        context_id = (
            message_dict.get("contextId")
            or message_dict.get("context_id")
            or message_dict.get("sessionId")
            or message_dict.get("session_id")
        )
        if isinstance(context_id, str) and context_id:
            native_message["contextId"] = context_id
        task_id = message_dict.get("taskId") or message_dict.get("task_id")
        if isinstance(task_id, str) and task_id:
            native_message["taskId"] = task_id
        message_id = message_dict.get("messageId") or message_dict.get("message_id")
        if isinstance(message_id, str) and message_id:
            native_message["messageId"] = message_id
    return native_message


def _extract_history(context: Any) -> list[Any]:
    history = getattr(context, "history", None)
    if _is_list(history):
        return history

    task = getattr(context, "task", None)
    if task is not None:
        task_history = getattr(task, "history", None)
        if _is_list(task_history):
            return task_history

    return []


def build_query_payload(
    context: Any,
    native_wire_version: str = DEFAULT_A2A_WIRE_VERSION,
) -> QueryPayload:
    current_message = getattr(context, "message", None)
    if current_message is None:
        return QueryPayload(query_type="user", input_data="No message", preview_text="No message")

    preview_text = extract_text_from_message(current_message)
    messages_input = [a2a_message_to_native_message(msg, wire_version=native_wire_version) for msg in _extract_history(context)]
    messages_input.append(a2a_message_to_native_message(current_message, wire_version=native_wire_version))
    return QueryPayload(
        query_type="messages",
        input_data=messages_input,
        preview_text=preview_text,
    )
