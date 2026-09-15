"""Security controls for file-gateway uploads and downloads proxied through ark-api."""

import re
from urllib.parse import quote, unquote

from fastapi import HTTPException

from .svg_sanitize import (
    CONTENT_TYPE_ATTR,
    FILENAME_ATTR,
    is_svg_payload,
    sanitize_svg_if_needed,
)

FILE_GATEWAY_SERVICES = frozenset({"file-gateway-api", "file-gateway"})
DOWNLOAD_SUFFIX = "/download"
# Types a browser executes as a document; SVG is excluded, it is sanitized instead.
ACTIVE_CONTENT_TYPES = frozenset({
    "text/html",
    "application/xhtml+xml",
    "text/xml",
    "application/xml",
})
SVG_DOWNLOAD_CSP = (
    "default-src 'none'; script-src 'none'; object-src 'none'; frame-src 'none'"
)

# Control chars, quotes, and backslashes are illegal/ambiguous in a quoted
# Content-Disposition filename and enable header injection / filename spoofing.
UNSAFE_FILENAME_CHARS = re.compile(r'[\x00-\x1f\x7f"\\]')


def _content_disposition(filename: str | None) -> str:
    """Build a safe attachment Content-Disposition for an attacker-controlled name.

    The raw filename comes from the (url-decoded) download path, so it may contain
    quotes, backslashes, or CR/LF. Emit a sanitized ASCII fallback plus an RFC 5987
    filename* for full-fidelity unicode without letting the name break the header.
    """
    name = filename or "download"
    ascii_fallback = UNSAFE_FILENAME_CHARS.sub("_", name)
    ascii_fallback = ascii_fallback.encode("ascii", "ignore").decode("ascii").strip()
    ascii_fallback = ascii_fallback or "download"
    encoded = quote(name, safe="")
    return f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'


def _extract_boundary(content_type: str) -> str | None:
    match = re.search(r"boundary=([^;]+)", content_type, flags=re.I)
    if not match:
        return None
    return match.group(1).strip().strip('"')


def _parse_multipart_headers(headers: str) -> tuple[str | None, str | None]:
    filename = None
    content_type = None
    filename_match = FILENAME_ATTR.search(headers)
    if filename_match:
        filename = filename_match.group(1)
    content_type_match = CONTENT_TYPE_ATTR.search(headers)
    if content_type_match:
        content_type = content_type_match.group(1).strip()
    return filename, content_type


def _iter_multipart_parts(body: bytes, boundary: str):
    delimiter = f"--{boundary}".encode()
    for part in body.split(delimiter):
        if not part or part in (b"--", b"--\r\n"):
            continue
        chunk = part.lstrip(b"\r\n")
        if chunk.endswith(b"\r\n"):
            chunk = chunk[:-2]
        header_end = chunk.find(b"\r\n\r\n")
        if header_end == -1:
            continue
        headers = chunk[:header_end].decode("utf-8", errors="replace")
        content = chunk[header_end + 4 :]
        yield headers, content


def _rebuild_multipart(boundary: str, parts: list[tuple[str, bytes]]) -> bytes:
    chunks: list[bytes] = []
    for headers, content in parts:
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(headers.encode())
        chunks.append(b"\r\n\r\n")
        chunks.append(content)
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks)


def is_file_gateway_upload(server_name: str, method: str, path: str) -> bool:
    normalized = path.rstrip("/")
    return (
        server_name in FILE_GATEWAY_SERVICES
        and method.upper() == "POST"
        and normalized == "files"
    )


def is_file_gateway_download(server_name: str, method: str, path: str) -> bool:
    return (
        server_name in FILE_GATEWAY_SERVICES
        and method.upper() == "GET"
        and path.rstrip("/").endswith(DOWNLOAD_SUFFIX)
    )


def sanitize_file_gateway_upload(body: bytes, content_type: str | None) -> bytes:
    if not body or not content_type or "multipart/form-data" not in content_type.lower():
        return body

    boundary = _extract_boundary(content_type)
    if not boundary:
        return body

    rebuilt_parts: list[tuple[str, bytes]] = []
    changed = False

    # Every part: a raw match on name="file" misses name=file; only <svg> roots change.
    for headers, content in _iter_multipart_parts(body, boundary):
        filename, part_content_type = _parse_multipart_headers(headers)
        try:
            sanitized = sanitize_svg_if_needed(filename, part_content_type, content)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if sanitized != content:
            changed = True
        rebuilt_parts.append((headers, sanitized))

    if not changed:
        return body
    return _rebuild_multipart(boundary, rebuilt_parts)


def _filename_from_download_path(path: str) -> str | None:
    trimmed = path.rstrip("/")
    if not trimmed.endswith(DOWNLOAD_SUFFIX):
        return None
    file_path = trimmed[: -len(DOWNLOAD_SUFFIX)]
    if "/" not in file_path:
        return unquote(file_path)
    return unquote(file_path.rsplit("/", 1)[-1])


def secure_file_gateway_download(
    content: bytes,
    response_headers: dict[str, str],
    download_path: str,
) -> tuple[bytes, dict[str, str]]:
    filename = _filename_from_download_path(download_path)
    content_type = response_headers.get("content-type") or response_headers.get("Content-Type")

    is_svg = is_svg_payload(filename, content_type, content)
    if is_svg:
        try:
            content = sanitize_svg_if_needed(filename, content_type, content)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Force every download to save rather than render. This "save, don't render"
    # header is the primary control: it neutralizes stored XSS for any file type
    # (SVG, HTML, etc.) regardless of content. SVG sanitize + CSP are added on top
    # as defense-in-depth.
    dropped = {"content-length", "content-disposition"}
    base_type = (content_type or "").split(";")[0].strip().lower()
    neutralize_type = base_type in ACTIVE_CONTENT_TYPES
    if neutralize_type:
        dropped.add("content-type")

    response_headers = {
        key: value
        for key, value in response_headers.items()
        if key.lower() not in dropped
    }
    if neutralize_type:
        # A blob: URL keeps the type but loses headers; lower-case key so media_type reads it.
        response_headers["content-type"] = "application/octet-stream"
    response_headers["Content-Disposition"] = _content_disposition(filename)
    response_headers["X-Content-Type-Options"] = "nosniff"
    response_headers["Content-Length"] = str(len(content))
    if is_svg:
        response_headers["Content-Security-Policy"] = SVG_DOWNLOAD_CSP

    return content, response_headers
