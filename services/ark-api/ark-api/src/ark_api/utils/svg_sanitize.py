"""Sanitize SVG content to prevent script execution when rendered in browsers."""

import re
from xml.etree import ElementTree as ET

try:
    from defusedxml import ElementTree as DefusedET
except ImportError:
    DefusedET = ET

ET.register_namespace("", "http://www.w3.org/2000/svg")
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")

# Elements removed entirely: they can execute script, embed active/external
# content, or animate attributes into dangerous values.
DANGEROUS_LOCAL_NAMES = frozenset({
    "script",
    "foreignobject",
    "iframe",
    "embed",
    "object",
    "handler",
    "set",
    "animate",
    "animatetransform",
    "animatemotion",
    "style",
})

EVENT_HANDLER_ATTR = re.compile(r"^on[a-z]+", re.I)
HREF_SCHEME = re.compile(r"^[a-z][a-z0-9+.\-]*:", re.I)
UNSAFE_STYLE = re.compile(r"expression\s*\(|javascript:", re.I)
FILENAME_ATTR = re.compile(r'filename="([^"]+)"', re.I)
CONTENT_TYPE_ATTR = re.compile(r"content-type:\s*([^\r\n]+)", re.I)


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1].lower()
    return tag.lower()


def is_svg_filename(filename: str | None) -> bool:
    return bool(filename and filename.lower().endswith(".svg"))


def is_svg_content_type(content_type: str | None) -> bool:
    if not content_type:
        return False
    base = content_type.split(";")[0].strip().lower()
    return base in ("image/svg+xml", "application/svg+xml")


def looks_like_svg(content: bytes) -> bool:
    if not content:
        return False
    head = content[:4096].lstrip()
    return head.startswith(b"<") and b"svg" in head[:512].lower()


def is_svg_payload(filename: str | None, content_type: str | None, content: bytes) -> bool:
    if is_svg_filename(filename) or is_svg_content_type(content_type):
        return True
    return looks_like_svg(content)


def _is_safe_href(value: str) -> bool:
    """Allow only same-document fragment refs and scheme-less relative paths.

    Anything with a URL scheme (javascript:, data:, http:, ...) or a
    protocol-relative prefix (//) is treated as unsafe and stripped, which blocks
    both script execution and external resource loading (data exfiltration).
    """
    stripped = value.strip()
    if not stripped or stripped.startswith("#"):
        return True
    if stripped.startswith("//"):
        return False
    return not HREF_SCHEME.match(stripped)


def _sanitize_attributes(elem: ET.Element) -> None:
    for attr in list(elem.attrib):
        attr_lower = attr.lower()
        local_attr = attr_lower.rsplit("}", 1)[-1] if "}" in attr_lower else attr_lower
        if EVENT_HANDLER_ATTR.match(local_attr):
            del elem.attrib[attr]
            continue
        if local_attr in ("href", "xlink:href") or attr_lower.endswith("}href"):
            if not _is_safe_href(elem.attrib[attr]):
                del elem.attrib[attr]
            continue
        if local_attr == "style" and UNSAFE_STYLE.search(elem.attrib[attr]):
            del elem.attrib[attr]


def _sanitize_element(elem: ET.Element) -> None:
    for child in list(elem):
        if _local_name(child.tag) in DANGEROUS_LOCAL_NAMES:
            elem.remove(child)
            continue
        _sanitize_element(child)
    _sanitize_attributes(elem)


def sanitize_svg(content: bytes) -> bytes:
    if not content:
        return content
    try:
        root = DefusedET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid SVG content: {exc}") from exc

    if _local_name(root.tag) in DANGEROUS_LOCAL_NAMES:
        raise ValueError("Disallowed root element in SVG content")

    _sanitize_element(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def sanitize_svg_if_needed(filename: str | None, content_type: str | None, content: bytes) -> bytes:
    if not is_svg_payload(filename, content_type, content):
        return content
    return sanitize_svg(content)
