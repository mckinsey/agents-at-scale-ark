"""Detect file formats that can carry active content, for upload-time type checks.

Only the active formats need signatures: the upload check rejects a file whose real
format can carry active content but whose declared name says it is something inert,
so anything unrecognised is treated as inert and passes.
"""

import re

from .svg_sanitize import looks_like_svg

ACTIVE_HTML = "html"
ACTIVE_SVG = "svg"
ACTIVE_PDF = "pdf"
ACTIVE_ZIP = "zip"
ACTIVE_RTF = "rtf"
ACTIVE_EXECUTABLE = "executable"

HTML_ROOT = re.compile(rb"^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!doctype\s+html|<html[\s>])", re.I)

BYTE_SIGNATURES = (
    (b"%PDF-", ACTIVE_PDF),
    (b"PK\x03\x04", ACTIVE_ZIP),
    (b"{\\rtf", ACTIVE_RTF),
    (b"\x7fELF", ACTIVE_EXECUTABLE),
)

ZIP_EXTENSIONS = (
    ".zip", ".docx", ".xlsx", ".pptx", ".docm", ".xlsm", ".pptm", ".odt", ".ods",
    ".odp", ".epub", ".jar", ".war", ".ear", ".apk", ".ipa", ".xpi", ".crx",
    ".whl", ".egg", ".kmz", ".numbers", ".pages", ".key",
)

EXTENSION_TYPES = {
    ".html": ACTIVE_HTML,
    ".htm": ACTIVE_HTML,
    ".xhtml": ACTIVE_HTML,
    ".shtml": ACTIVE_HTML,
    ".svg": ACTIVE_SVG,
    ".svgz": ACTIVE_SVG,
    ".pdf": ACTIVE_PDF,
    ".rtf": ACTIVE_RTF,
    ".exe": ACTIVE_EXECUTABLE,
    ".dll": ACTIVE_EXECUTABLE,
    ".so": ACTIVE_EXECUTABLE,
    ".bin": ACTIVE_EXECUTABLE,
    **dict.fromkeys(ZIP_EXTENSIONS, ACTIVE_ZIP),
}

CONTENT_TYPE_TYPES = {
    "text/html": ACTIVE_HTML,
    "application/xhtml+xml": ACTIVE_HTML,
    "image/svg+xml": ACTIVE_SVG,
    "application/svg+xml": ACTIVE_SVG,
    "application/pdf": ACTIVE_PDF,
    "application/zip": ACTIVE_ZIP,
    "application/x-zip-compressed": ACTIVE_ZIP,
    "application/java-archive": ACTIVE_ZIP,
    "application/epub+zip": ACTIVE_ZIP,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ACTIVE_ZIP,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ACTIVE_ZIP,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ACTIVE_ZIP,
    "application/vnd.oasis.opendocument.text": ACTIVE_ZIP,
    "application/vnd.oasis.opendocument.spreadsheet": ACTIVE_ZIP,
    "application/vnd.oasis.opendocument.presentation": ACTIVE_ZIP,
    "application/rtf": ACTIVE_RTF,
    "text/rtf": ACTIVE_RTF,
    "application/x-msdownload": ACTIVE_EXECUTABLE,
    "application/vnd.microsoft.portable-executable": ACTIVE_EXECUTABLE,
    "application/x-executable": ACTIVE_EXECUTABLE,
}

UTF8_BOM = b"\xef\xbb\xbf"
HTML_SNIFF_BYTES = 1024
PE_HEADER_BYTES = 64


def _is_pe_executable(head: bytes) -> bool:
    """Require a NUL in the DOS header so text merely starting with "MZ" is not flagged."""
    return head.startswith(b"MZ") and b"\x00" in head[:PE_HEADER_BYTES]


def detect_active_content(content: bytes) -> str | None:
    """Return the active-content family the bytes really are, or None if inert."""
    if not content:
        return None

    head = content[len(UTF8_BOM):] if content.startswith(UTF8_BOM) else content

    for signature, kind in BYTE_SIGNATURES:
        if head.startswith(signature):
            return kind
    if _is_pe_executable(head):
        return ACTIVE_EXECUTABLE
    if HTML_ROOT.match(head[:HTML_SNIFF_BYTES]):
        return ACTIVE_HTML
    if looks_like_svg(head):
        return ACTIVE_SVG
    return None


def declared_active_type(filename: str | None, content_type: str | None) -> str | None:
    """Return the active-content family the upload claims to be, or None for inert.

    The filename is authoritative whenever one is present: it is what gets stored and
    what downstream readers key off, whereas the part's content-type is transport
    metadata that is not persisted. Falling back to content-type for a named part would
    let "filename=x.png" with "Content-Type: text/html" declare itself as html and match
    its own payload, which is the disguise this check exists to catch.
    """
    if filename:
        name = filename.strip().lower()
        for extension, kind in EXTENSION_TYPES.items():
            if name.endswith(extension):
                return kind
        return None
    if content_type:
        return CONTENT_TYPE_TYPES.get(content_type.split(";")[0].strip().lower())
    return None


def assert_declared_type(filename: str | None, content_type: str | None, content: bytes) -> None:
    """Raise ValueError when active content is disguised as something it is not."""
    sniffed = detect_active_content(content)
    if sniffed is None:
        return
    declared = declared_active_type(filename, content_type)
    if sniffed == declared:
        return
    claimed = filename or content_type or "an unnamed part"
    raise ValueError(
        f"Upload rejected: content is {sniffed} but the file is declared as {claimed}"
    )
