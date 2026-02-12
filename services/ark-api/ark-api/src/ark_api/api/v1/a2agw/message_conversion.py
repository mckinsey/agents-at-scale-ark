import json
from dataclasses import dataclass
from typing import Any, TypeGuard


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


def _extract_file_url(part_dict: dict[str, Any]) -> str | None:
    direct_url = part_dict.get("url")
    if isinstance(direct_url, str) and direct_url:
        return direct_url

    direct_raw = part_dict.get("raw")
    if isinstance(direct_raw, str) and direct_raw:
        media_type = part_dict.get("mediaType") or part_dict.get("mimeType") or part_dict.get("mime_type") or "application/octet-stream"
        return f"data:{media_type};base64,{direct_raw}"

    direct_uri = part_dict.get("uri")
    if isinstance(direct_uri, str) and direct_uri:
        return direct_uri

    file_value = part_dict.get("file")
    if _is_dict(file_value):
        uri = file_value.get("uri")
        if isinstance(uri, str) and uri:
            return uri

        bytes_value = file_value.get("bytes")
        if isinstance(bytes_value, str) and bytes_value:
            mime_type = file_value.get("mimeType") or file_value.get("mime_type") or "application/octet-stream"
            return f"data:{mime_type};base64,{bytes_value}"

    direct_bytes = part_dict.get("bytes")
    if isinstance(direct_bytes, str) and direct_bytes:
        mime_type = part_dict.get("mimeType") or part_dict.get("mime_type") or "application/octet-stream"
        return f"data:{mime_type};base64,{direct_bytes}"

    return None


def _extract_text_from_part(part: Any) -> str | None:
    part_dict = _to_dict(part)
    if not _is_dict(part_dict):
        return None
    text = part_dict.get("text")
    if isinstance(text, str) and text:
        return text
    data_value = part_dict.get("data")
    if data_value is not None:
        return data_value if isinstance(data_value, str) else json.dumps(data_value)
    file_url = _extract_file_url(part_dict)
    if file_url:
        return file_url
    return None


def extract_text_from_message(message: Any) -> str:
    if message is None:
        return "No message"

    parts = getattr(message, "parts", None)
    if not _is_list(parts):
        message_dict = _to_dict(message)
        if _is_dict(message_dict):
            parts = message_dict.get("parts")

    if not _is_list(parts):
        return "No message"

    for part in parts:
        part_root = _extract_part_value(part, "root") or part
        text = _extract_text_from_part(part_root)
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
    parts: list[Any] = []
    if _is_dict(message_dict):
        raw_parts = message_dict.get("parts", [])
        if _is_list(raw_parts):
            parts = raw_parts

    content_parts: list[dict[str, Any]] = []
    for raw_part in parts:
        part_root = _extract_part_value(raw_part, "root") or raw_part
        part_dict = _to_dict(part_root)
        if not _is_dict(part_dict):
            continue

        kind = part_dict.get("kind")
        if "text" in part_dict and isinstance(part_dict.get("text"), str):
            text = part_dict.get("text")
            if isinstance(text, str) and text:
                content_parts.append({"type": "text", "text": text})
            continue

        if "data" in part_dict and part_dict.get("data") is not None:
            data_value = part_dict.get("data")
            text_value = data_value if isinstance(data_value, str) else json.dumps(data_value)
            content_parts.append({"type": "text", "text": text_value})
            continue

        if "url" in part_dict or "raw" in part_dict:
            url = _extract_file_url(part_dict)
            media_type = part_dict.get("mediaType") or part_dict.get("mimeType") or part_dict.get("mime_type") or ""
            if url:
                if isinstance(media_type, str) and media_type.startswith("image/"):
                    content_parts.append({"type": "image_url", "image_url": {"url": url}})
                else:
                    content_parts.append({"type": "text", "text": url})
            continue

        if kind == "text":
            text = part_dict.get("text")
            if isinstance(text, str) and text:
                content_parts.append({"type": "text", "text": text})
            continue

        if kind == "file":
            url = _extract_file_url(part_dict)
            if url:
                content_parts.append({"type": "image_url", "image_url": {"url": url}})
            continue

        if kind == "data":
            data_value = part_dict.get("data")
            if data_value is not None:
                text_value = data_value if isinstance(data_value, str) else json.dumps(data_value)
                content_parts.append({"type": "text", "text": text_value})

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


def a2a_message_to_native_message(message: Any) -> dict[str, Any]:
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

    parts: list[dict[str, Any]] = []
    raw_parts: Any = []
    if _is_dict(message_dict):
        raw_parts = message_dict.get("parts", [])
    elif hasattr(message, "parts"):
        raw_parts = getattr(message, "parts")
    if _is_list(raw_parts):
        for raw_part in raw_parts:
            part_root = _extract_part_value(raw_part, "root") or raw_part
            part_dict = _to_dict(part_root)
            if _is_dict(part_dict):
                parts.append(part_dict)
    if not parts:
        fallback_text = extract_text_from_message(message)
        if fallback_text == "No message":
            fallback_text = ""
        parts = [{"kind": "text", "text": fallback_text}]

    native_message: dict[str, Any] = {"role": role, "parts": parts}
    if _is_dict(message_dict):
        context_id = message_dict.get("contextId") or message_dict.get("context_id")
        if isinstance(context_id, str) and context_id:
            native_message["contextId"] = context_id
        task_id = message_dict.get("taskId") or message_dict.get("task_id")
        if isinstance(task_id, str) and task_id:
            native_message["taskId"] = task_id
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


def build_query_payload(context: Any, experimental_enabled: bool = False) -> QueryPayload:
    current_message = getattr(context, "message", None)
    if current_message is None:
        return QueryPayload(query_type="user", input_data="No message", preview_text="No message")

    preview_text = extract_text_from_message(current_message)
    if experimental_enabled:
        messages_input = [a2a_message_to_native_message(msg) for msg in _extract_history(context)]
        messages_input.append(a2a_message_to_native_message(current_message))
        return QueryPayload(
            query_type="messages",
            input_data=messages_input,
            preview_text=preview_text,
        )

    current_openai_message = a2a_message_to_openai_message(current_message)

    history_messages = [a2a_message_to_openai_message(msg) for msg in _extract_history(context)]
    has_history = len(history_messages) > 0

    is_simple_text = (
        not has_history
        and current_openai_message.get("role") == "user"
        and isinstance(current_openai_message.get("content"), str)
    )
    if is_simple_text:
        return QueryPayload(
            query_type="user",
            input_data=current_openai_message.get("content", ""),
            preview_text=preview_text,
        )

    messages_input = history_messages + [current_openai_message]
    return QueryPayload(
        query_type="messages",
        input_data=messages_input,
        preview_text=preview_text,
    )
