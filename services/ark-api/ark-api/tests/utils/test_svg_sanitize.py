import pytest

from ark_api.utils.svg_sanitize import is_svg_payload, sanitize_svg


MALICIOUS_SVG = b"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)">
  <script>alert(1)</script>
  <foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(2)</script></body></foreignObject>
</svg>
"""

SAFE_SVG = b"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="blue"/>
</svg>
"""


def test_is_svg_payload_by_filename():
    assert is_svg_payload("icon.svg", None, b"<svg></svg>")
    assert not is_svg_payload("icon.png", None, b"PNG")


def test_sanitize_svg_removes_script_and_event_handlers():
    sanitized = sanitize_svg(MALICIOUS_SVG)
    text = sanitized.decode("utf-8").lower()
    assert "<script" not in text
    assert "onload=" not in text
    assert "foreignobject" not in text
    assert "<svg" in text


def test_sanitize_svg_preserves_safe_content():
    sanitized = sanitize_svg(SAFE_SVG)
    assert b"<rect" in sanitized


def test_sanitize_svg_rejects_invalid_xml():
    with pytest.raises(ValueError, match="Invalid SVG"):
        sanitize_svg(b"not xml")


def test_sanitize_svg_removes_style_and_animation():
    svg = (
        b'<svg xmlns="http://www.w3.org/2000/svg">'
        b"<style>@import url(http://evil/x.css);</style>"
        b'<a><animate attributeName="href" to="javascript:alert(1)"/></a>'
        b"</svg>"
    )
    text = sanitize_svg(svg).decode("utf-8").lower()
    assert "<style" not in text
    assert "<animate" not in text
    assert "javascript:" not in text


def test_sanitize_svg_strips_external_and_data_hrefs():
    svg = (
        b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
        b'<image xlink:href="http://evil/leak.png"/>'
        b'<image href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"/>'
        b'<use href="#safe"/>'
        b"</svg>"
    )
    text = sanitize_svg(svg).decode("utf-8").lower()
    assert "http://evil" not in text
    assert "data:text/html" not in text
    assert 'href="#safe"' in text  # internal fragment refs are preserved


def test_sanitize_svg_rejects_dangerous_root():
    with pytest.raises(ValueError, match="Disallowed root"):
        sanitize_svg(b"<script>alert(1)</script>")
