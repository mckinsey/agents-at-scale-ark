"""Sanitize SVG content to prevent script execution when rendered in browsers."""

import io
import re
from xml.etree import ElementTree as ET

try:
    from defusedxml import ElementTree as DefusedET
except ImportError:
    DefusedET = ET

# Namespace identifiers, never fetched; https:// here would not be treated as SVG.
ET.register_namespace("", "http://www.w3.org/2000/svg")  # NOSONAR - namespace identifier, not a URL
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")  # NOSONAR - namespace identifier, not a URL

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

# Well under sys.getrecursionlimit(), which ET.tostring() consumes when serializing.
MAX_SVG_DEPTH = 256

EVENT_HANDLER_ATTR = re.compile(r"^on[a-z]+", re.I)
HREF_SCHEME = re.compile(r"^[a-z][a-z0-9+.\-]*:", re.I)
UNSAFE_STYLE = re.compile(r"expression\s*\(|javascript:", re.I)
# Browsers drop these before parsing a scheme, so "java&#9;script:" runs as "javascript:".
URL_IGNORED_CHARS = re.compile(r"[\x00-\x1f\x7f]")
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
    """Content-sniff an SVG document, for payloads smuggled under another name."""
    if not content:
        return False
    head = content[:4096].lstrip()
    if not head.startswith(b"<") or b"svg" not in head[:512].lower():
        return False
    try:
        # Root element decides; "start" events stop there, so large files are not read.
        for _event, elem in DefusedET.iterparse(io.BytesIO(content), events=("start",)):
            return _local_name(elem.tag) == "svg"
    except ET.ParseError:
        return False
    except Exception:  # noqa: BLE001 - defusedxml refused it, so fail closed
        return True
    return False


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
    stripped = URL_IGNORED_CHARS.sub("", value).strip()
    if not stripped or stripped.startswith("#"):
        return True
    if stripped.startswith("//"):
        return False
    return not HREF_SCHEME.match(stripped)


def _sanitize_attributes(elem: ET.Element) -> None:
    # list() snapshots the keys: deleting from a live attrib raises RuntimeError.
    for attr in list(elem.attrib):  # NOSONAR - iterating a snapshot while mutating
        attr_lower = attr.lower()
        local_attr = attr_lower.rsplit("}", 1)[-1] if "}" in attr_lower else attr_lower
        if EVENT_HANDLER_ATTR.match(local_attr):
            del elem.attrib[attr]
            continue
        if local_attr in ("href", "xlink:href") or attr_lower.endswith("}href"):
            if not _is_safe_href(elem.attrib[attr]):
                del elem.attrib[attr]
            continue
        if local_attr == "style" and UNSAFE_STYLE.search(
            URL_IGNORED_CHARS.sub("", elem.attrib[attr])
        ):
            del elem.attrib[attr]


def _sanitize_element(root: ET.Element) -> None:
    # Depth-capped: RecursionError here or in ET.tostring() would escape as a 500.
    stack = [(root, 0)]
    while stack:
        elem, depth = stack.pop()
        if depth > MAX_SVG_DEPTH:
            raise ValueError(f"SVG nesting exceeds {MAX_SVG_DEPTH} levels")
        # list() snapshots: removing from a live element skips the next sibling.
        for child in list(elem):  # NOSONAR - iterating a snapshot while mutating
            if _local_name(child.tag) in DANGEROUS_LOCAL_NAMES:
                elem.remove(child)
                continue
            stack.append((child, depth + 1))
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
