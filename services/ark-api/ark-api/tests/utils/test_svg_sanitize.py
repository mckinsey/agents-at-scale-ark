import unittest

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


class TestSvgSanitize(unittest.TestCase):
    def test_is_svg_payload_by_filename(self):
        self.assertTrue(is_svg_payload("icon.svg", None, b"<svg></svg>"))
        self.assertFalse(is_svg_payload("icon.png", None, b"PNG"))

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

    def test_sanitize_svg_rejects_dangerous_root(self):
        with self.assertRaisesRegex(ValueError, "Disallowed root"):
            sanitize_svg(b"<script>alert(1)</script>")
