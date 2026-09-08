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
})

# Well under sys.getrecursionlimit(), which ET.tostring() consumes when serializing.
MAX_SVG_DEPTH = 256

EVENT_HANDLER_ATTR = re.compile(r"^on[a-z]+", re.I)
HREF_SCHEME = re.compile(r"^[a-z][a-z0-9+.\-]*:", re.I)
UNSAFE_STYLE = re.compile(r"expression\s*\(|javascript:|@import", re.I)
# Only the url( opener is matched; the target is scanned for so the cost stays linear.
CSS_URL_OPEN = re.compile(r"url\s*\(", re.I)
# Embedded rasters are inert as paint values; SVG-in-data-URI is a document, so it is excluded.
SAFE_DATA_URL = re.compile(r"^data:image/(?!svg\+xml)[a-z0-9.+-]+[;,]", re.I)
# Browsers drop these before parsing a scheme, so "java&#9;script:" runs as "javascript:".
URL_IGNORED_CHARS = re.compile(r"[\x00-\x1f\x7f]")
FILENAME_ATTR = re.compile(r"""filename\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\r\n]*))""", re.I)
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
    """Allow same-document fragment refs, scheme-less relative paths, inline rasters.

    Anything with a URL scheme (javascript:, http:, ...) or a protocol-relative
    prefix (//) is treated as unsafe and stripped, which blocks both script
    execution and external resource loading (data exfiltration). An inline
    data:image/* payload defeats neither -- it cannot execute and is self-contained,
    so it has no egress channel -- and is allowed; data:image/svg+xml is a document
    rather than a raster, so it stays blocked. Governs CSS url() targets too.
    """
    # Browsers fold backslashes to slashes for special schemes, so "\\evil.com"
    # would resolve as "//evil.com" against an https base.
    stripped = URL_IGNORED_CHARS.sub("", value).replace("\\", "/").strip()
    if not stripped or stripped.startswith("#"):
        return True
    if stripped.startswith("//"):
        return False
    if SAFE_DATA_URL.match(stripped):
        return True
    return not HREF_SCHEME.match(stripped)


def _css_url_targets(css: str):
    """Yield each url() target; None for an unterminated url( so callers fail closed.

    Scanned rather than matched with a single regex: a pattern that has to find the
    closing paren from every url( start is quadratic on unbalanced input, and this
    runs synchronously in the request handler. Each find resumes past the previous
    close paren, so the whole pass is linear.
    """
    pos = 0
    while (match := CSS_URL_OPEN.search(css, pos)) is not None:
        end = css.find(")", match.end())
        if end == -1:
            yield None
            return
        yield css[match.end() : end].strip().strip("\"'")
        pos = end + 1


def _has_unsafe_css(value: str) -> bool:
    """Reject CSS that executes script, imports, or pulls in an external reference.

    url() targets are held to the same policy as href: fragments and scheme-less
    relative paths are allowed, anything with a scheme or a protocol-relative
    prefix is not. CSS escapes are not decoded, so an escaped scheme
    (url(\\68 ttp://...)) still reaches the browser as an external fetch.
    """
    cleaned = URL_IGNORED_CHARS.sub("", value)
    if UNSAFE_STYLE.search(cleaned):
        return True
    return any(
        target is None or not _is_safe_href(target)
        for target in _css_url_targets(cleaned)
    )


def _sanitize_attributes(elem: ET.Element) -> None:
    # list() snapshots the keys: deleting from a live attrib raises RuntimeError.
    for attr in list(elem.attrib):  # NOSONAR - iterating a snapshot while mutating
        attr_lower = attr.lower()
        local_attr = attr_lower.rsplit("}", 1)[-1] if "}" in attr_lower else attr_lower
        if EVENT_HANDLER_ATTR.match(local_attr):
            del elem.attrib[attr]
            continue
        if local_attr == "href":
            if not _is_safe_href(elem.attrib[attr]):
                del elem.attrib[attr]
            continue
        if local_attr == "style" and _has_unsafe_css(elem.attrib[attr]):
            del elem.attrib[attr]


def _sanitize_element(root: ET.Element) -> None:
    # Depth-capped: RecursionError here or in ET.tostring() would escape as a 500.
    stack = [(root, 0)]
    while stack:
        elem, depth = stack.pop()
        if depth > MAX_SVG_DEPTH:
            raise ValueError(f"SVG nesting exceeds {MAX_SVG_DEPTH} levels")
        # Checked on the popped element, not on children, so a root <style> is covered
        # by the same pass. Kept so legitimate stylesheets still paint; cleared wholesale
        # when any rule is unsafe, matching how an unsafe style= drops the whole attribute.
        if _local_name(elem.tag) == "style" and _has_unsafe_css(elem.text or ""):
            elem.text = ""
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
