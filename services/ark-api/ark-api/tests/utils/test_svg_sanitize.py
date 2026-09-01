import unittest

from ark_api.utils.svg_sanitize import is_svg_payload, looks_like_svg, sanitize_svg

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


class TestSvgSanitize(unittest.TestCase):
    def test_is_svg_payload_by_filename(self):
        self.assertTrue(is_svg_payload("icon.svg", None, b"<svg></svg>"))
        self.assertFalse(is_svg_payload("icon.png", None, b"PNG"))

    def test_looks_like_svg_ignores_non_svg_roots(self):
        # A substring test rejected valid HTML and rewrote valid XML.
        self.assertFalse(looks_like_svg(b"<html><body><p>our svg icons</p><br></body></html>"))
        self.assertFalse(looks_like_svg(b"<config><dir>/var/svg/</dir><flag/></config>"))
        self.assertFalse(looks_like_svg(b"not markup at all"))
        self.assertFalse(looks_like_svg(b""))

    def test_looks_like_svg_detects_smuggled_and_undecidable(self):
        # Content sniffing still has to catch an SVG stored under another name.
        self.assertTrue(looks_like_svg(b'<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'))
        self.assertTrue(looks_like_svg(b'<svg onload="alert(1)"/>'))  # no namespace
        self.assertTrue(
            looks_like_svg(
                b'<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/x.dtd">'
                b'<svg xmlns="http://www.w3.org/2000/svg"/>'
            )
        )
        # Refused by defusedxml, so undecidable: assume SVG and let sanitize reject it.
        self.assertTrue(
            looks_like_svg(
                b'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>'
                b'<svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>'
            )
        )

    def test_sanitize_svg_removes_script_and_event_handlers(self):
        text = sanitize_svg(MALICIOUS_SVG).decode("utf-8").lower()
        self.assertNotIn("<script", text)
        self.assertNotIn("onload=", text)
        self.assertNotIn("foreignobject", text)
        self.assertIn("<svg", text)

    def test_sanitize_svg_preserves_safe_content(self):
        self.assertIn(b"<rect", sanitize_svg(SAFE_SVG))

    def test_sanitize_svg_rejects_invalid_xml(self):
        with self.assertRaisesRegex(ValueError, "Invalid SVG"):
            sanitize_svg(b"not xml")

    def test_sanitize_svg_removes_style_and_animation(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<style>@import url(http://evil/x.css);</style>"
            b'<a><animate attributeName="href" to="javascript:alert(1)"/></a>'
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8").lower()
        self.assertNotIn("<style", text)
        self.assertNotIn("<animate", text)
        self.assertNotIn("javascript:", text)

    def test_sanitize_svg_strips_external_and_data_hrefs(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
            b'<image xlink:href="http://evil/leak.png"/>'
            b'<image href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"/>'
            b'<use href="#safe"/>'
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8").lower()
        self.assertNotIn("http://evil", text)
        self.assertNotIn("data:text/html", text)
        self.assertIn('href="#safe"', text)  # internal fragment refs are preserved

    def test_sanitize_svg_strips_control_char_split_schemes(self):
        # The parser turns &#9; into a real tab, so "java&#9;script:" runs as "javascript:".
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<a href="java&#9;script:alert(1)"><text>a</text></a>'
            b'<a href="java&#10;script:alert(2)"><text>b</text></a>'
            b'<a href="java&#13;script:alert(3)"><text>c</text></a>'
            b'<rect style="background:url(java&#9;script:alert(4))"/>'
            b'<use href="#safe"/>'
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8").lower()
        self.assertNotIn("script:", text)
        self.assertNotIn("style=", text)
        self.assertIn('href="#safe"', text)  # legitimate refs still survive

    def test_sanitize_svg_rejects_dangerous_root(self):
        with self.assertRaisesRegex(ValueError, "Disallowed root"):
            sanitize_svg(b"<script>alert(1)</script>")
