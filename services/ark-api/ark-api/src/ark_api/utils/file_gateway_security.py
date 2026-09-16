"""Security controls for file-gateway uploads and downloads proxied through ark-api."""

import re
from urllib.parse import quote, unquote

from fastapi import HTTPException
from python_multipart.multipart import parse_options_header

from .active_content import assert_declared_type
from .svg_sanitize import (
    is_svg_payload,
    sanitize_svg,
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

# RFC 5987 extended parameter; parse_options_header does not surface it.
EXT_FILENAME_ATTR = re.compile(r"filename\*\s*=\s*([^;]+)", re.I)


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
    """Read the boundary with the same parser the ASGI server uses.

    A regex on a literal "boundary=" misses the linear white space that is legal
    around a MIME parameter, and picks up a "boundary=" that appears inside an
    earlier quoted parameter value. Either way the caller would read a different
    boundary than the server does.
    """
    _, params = parse_options_header(content_type)
    raw = params.get(b"boundary")
    if raw is None:
        return None
    return raw.decode("utf-8", errors="replace").strip() or None


def _decode_ext_filename(raw: str) -> str | None:
    """Decode an RFC 5987 filename* value (charset'lang'percent-encoded)."""
    parts = raw.strip().strip('"').split("'", 2)
    if len(parts) != 3:
        return None
    charset, _lang, encoded = parts
    try:
        return unquote(encoded, encoding=charset or "utf-8", errors="strict") or None
    except (LookupError, UnicodeDecodeError):
        return None


def _parse_multipart_headers(headers: str) -> tuple[str | None, str | None]:
    """Read the part's filename and content-type from its own headers.

    The filename is taken only from the parsed Content-Disposition parameters. A
    scan of the whole header block would let any earlier textual "filename=" - in
    a decoy header line, or inside a quoted name - win over the real parameter,
    and the check would then compare the sniffed bytes against a name that is not
    the one the file is stored under.
    """
    disposition = None
    content_type = None
    for line in headers.splitlines():
        name, separator, value = line.partition(":")
        if not separator:
            continue
        key = name.strip().lower()
        if key == "content-disposition" and disposition is None:
            disposition = value.strip()
        elif key == "content-type" and content_type is None:
            content_type = value.strip() or None

    filename = None
    if disposition:
        _, params = parse_options_header(disposition)
        raw = params.get(b"filename")
        if raw is not None:
            decoded = raw.decode("utf-8", errors="replace").strip()
            # Single quotes are not RFC 2045 quoting, so the parser keeps them; a
            # client sending filename='x.svg' means x.svg, as the old match read it.
            if len(decoded) >= 2 and decoded[0] == decoded[-1] == "'":
                decoded = decoded[1:-1].strip()
            filename = decoded or None
        else:
            # parse_options_header drops filename*, so read it separately rather
            # than leaving the declared type unknown and skipping the check.
            ext = EXT_FILENAME_ATTR.search(disposition)
            if ext:
                filename = _decode_ext_filename(ext.group(1))
    return filename, content_type


def _iter_multipart_parts(body: bytes, boundary: str):
    # LF-only framing is tolerated rather than skipped: Go's mime/multipart accepts
    # it deliberately, so a body the file-gateway parses must not slip past unchecked.
    delimiter = f"--{boundary}".encode()
    for part in body.split(delimiter):
        if not part or part.strip() in (b"", b"--"):
            continue
        chunk = part.lstrip(b"\r\n")
        chunk = chunk.rstrip(b"\r\n") if chunk.endswith((b"\r\n", b"\n")) else chunk
        header_end = chunk.find(b"\r\n\r\n")
        separator = 4
        lf_end = chunk.find(b"\n\n")
        if header_end == -1 or (lf_end != -1 and lf_end < header_end):
            header_end = lf_end
            separator = 2
        if header_end == -1:
            continue
        headers = chunk[:header_end].decode("utf-8", errors="replace")
        content = chunk[header_end + separator :]
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
        # Forwarding a multipart body whose boundary will not parse would skip every
        # check below while the ASGI server may still parse it happily, so refuse it.
        raise HTTPException(
            status_code=400,
            detail="Malformed multipart upload: no usable boundary",
        )

    rebuilt_parts: list[tuple[str, bytes]] = []
    changed = False

    # Every part: a raw match on name="file" misses name=file; only <svg> roots change.
    for headers, content in _iter_multipart_parts(body, boundary):
        filename, part_content_type = _parse_multipart_headers(headers)
        try:
            if filename:
                assert_declared_type(filename, part_content_type, content)
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
    # The ASGI server already percent-decoded the path, so decoding again here would
    # turn a file genuinely named "a%20b.svg" into "a b.svg".
    file_path = trimmed[: -len(DOWNLOAD_SUFFIX)]
    if "/" not in file_path:
        return file_path
    return file_path.rsplit("/", 1)[-1]


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
            content = sanitize_svg(content)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Force every download to save rather than render. This "save, don't render"
    # header is the primary control: it neutralizes stored XSS for any file type
    # (SVG, HTML, etc.) regardless of content. SVG sanitize + CSP are added on top
    # as defense-in-depth.
    # content-encoding is also stripped by the proxy's response filter; kept here so
    # this function stays correct on its own for any future caller.
    dropped = {"content-length", "content-disposition", "content-encoding"}
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
