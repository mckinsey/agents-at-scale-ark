import time
import unittest

from ark_api.utils.svg_sanitize import (
    _has_unsafe_css,
    _is_safe_href,
    is_svg_payload,
    looks_like_svg,
    sanitize_svg,
)

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

    def test_sanitize_svg_clears_unsafe_style_rules_and_removes_animation(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<style>@import url(http://evil/x.css);</style>"
            b'<a><animate attributeName="href" to="javascript:alert(1)"/></a>'
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8").lower()
        self.assertNotIn("@import", text)
        self.assertNotIn("http://evil", text)
        self.assertNotIn("<animate", text)
        self.assertNotIn("javascript:", text)

    def test_sanitize_svg_keeps_legitimate_stylesheet(self):
        # Illustrator internal-CSS export: the rules are the only source of fills.
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<style>.st0{fill:#FFFFFF;} .st1{fill:none;stroke:#0A0;}</style>"
            b'<path class="st0" d="M2 2h20v20H2z"/>'
            b'<circle class="st1" cx="12" cy="12" r="6"/>'
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8")
        self.assertIn("fill:#FFFFFF", text)
        self.assertIn("stroke:#0A0", text)
        self.assertIn('class="st0"', text)

    def test_sanitize_svg_keeps_internal_url_references(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<style>.a{fill:url(#SVGID_1_)} .b{clip-path:url( '#clip' )} .c{mask:url(\"#m\")}</style>"
            b'<path style="fill:url(#SVGID_1_)" d="M0 0h1v1H0z"/>'
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8")
        self.assertIn("url(#SVGID_1_)", text)
        self.assertIn("#clip", text)
        self.assertIn("#m", text)
        self.assertIn('style="fill:url(#SVGID_1_)"', text)

    def test_sanitize_svg_clears_external_url_in_stylesheet(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<style>.a{background:url(https://evil.example/x.png)} .b{fill:#FFF}</style>"
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8")
        self.assertNotIn("evil.example", text)
        # Cleared wholesale, like an unsafe style= attribute: the safe rule goes too.
        self.assertNotIn("fill:#FFF", text)

    def test_sanitize_svg_strips_external_url_in_style_attribute(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<path style="background:url(http://evil.example/x.png)" d="M0 0h1v1H0z"/>'
            b'<rect style="background:url(//evil.example/x.png)"/>'
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8")
        self.assertNotIn("evil.example", text)
        self.assertNotIn("style=", text)

    def test_sanitize_svg_keeps_relative_url_reference(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<path style="fill:url(swatch.svg#grad)" d="M0 0h1v1H0z"/>'
            b"</svg>"
        )
        self.assertIn("swatch.svg#grad", sanitize_svg(svg).decode("utf-8"))

    def test_data_url_policy_is_identical_for_href_and_css(self):
        safe = [
            "data:image/png;base64,iVBOR",
            "data:image/jpeg,xxx",
            "data:image/PNG;base64,iVBOR",
            "#frag",
            "swatch.svg#grad",
        ]
        unsafe = [
            "data:image/svg+xml;base64,PHN2Zz4=",
            "data:image/SVG+XML;base64,PHN2Zz4=",
            "data:image/svg%2bxml;base64,PHN2",
            "data:text/html,<script>",
            "data:application/javascript,x",
            "data:image/png",
            "javascript:alert(1)",
            "http://evil/x.png",
            "//evil/x.png",
        ]
        for value in safe:
            with self.subTest(value=value):
                self.assertTrue(_is_safe_href(value))
                self.assertFalse(_has_unsafe_css(f"fill:url({value})"))
        for value in unsafe:
            with self.subTest(value=value):
                self.assertFalse(_is_safe_href(value))
                self.assertTrue(_has_unsafe_css(f"fill:url({value})"))

    def test_sanitize_svg_keeps_inline_raster_href(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<image href="data:image/png;base64,iVBOR"/>'
            b"</svg>"
        )
        self.assertIn("data:image/png", sanitize_svg(svg).decode("utf-8"))

    def test_sanitize_svg_strips_svg_data_url_href(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<image href="data:image/svg+xml;base64,PHN2Zz4="/>'
            b"</svg>"
        )
        self.assertNotIn("data:image/svg", sanitize_svg(svg).decode("utf-8"))

    def test_sanitize_svg_data_url_policy_in_css(self):
        raster = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<path style="fill:url(data:image/png;base64,iVBOR)" d="M0 0h1v1H0z"/>'
            b"</svg>"
        )
        self.assertIn("data:image/png", sanitize_svg(raster).decode("utf-8"))

        nested_svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<path style="fill:url(data:image/svg+xml;base64,PHN2Zz4=)" d="M0 0h1v1H0z"/>'
            b"</svg>"
        )
        self.assertNotIn("data:image/svg+xml", sanitize_svg(nested_svg).decode("utf-8"))

    def test_sanitize_svg_clears_script_css_in_stylesheet(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<style>.a{background:url(javascript:alert(1))} .b{width:expression(alert(2))}</style>"
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8").lower()
        self.assertNotIn("javascript:", text)
        self.assertNotIn("expression(", text)

    def test_sanitize_svg_still_removes_script_elements(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<script>alert(1)</script><style>.a{fill:#FFF}</style>"
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8").lower()
        self.assertNotIn("<script", text)
        self.assertNotIn("alert(1)", text)

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

    def test_has_unsafe_css_classifies_url_targets(self):
        safe = [
            "fill:url(#SVGID_1_)",
            "clip-path:url(  '#clip' )",
            'mask:url("#m")',
            "fill:url(swatch.svg#grad)",
            "fill:url(#a); stroke:url(#b)",
            "fill:url(data:image/png;base64,iVBOR)",
        ]
        unsafe = [
            "background:url(https://evil.example/x)",
            "background:url(//evil.example/x)",
            "background:url(\\\\evil.example/x)",
            "background:url(javascript:alert(1))",
            "background:image-set(url(http://e/x))",
            "width:expression(alert(1))",
            "@import url(http://evil/x.css)",
            "fill:url(data:image/svg+xml;base64,PHN2Zz4=)",
            "fill:url(#a); background:url(http://evil/x)",
            "background:url(",
            'background:url("http://evil/x)y.png")',
        ]
        for value in safe:
            with self.subTest(value=value):
                self.assertFalse(_has_unsafe_css(value))
        for value in unsafe:
            with self.subTest(value=value):
                self.assertTrue(_has_unsafe_css(value))

    def test_has_unsafe_css_is_linear_on_unbalanced_parens(self):
        # A single regex that hunts the closing paren from every url( start is
        # quadratic: 64 KB of "url(" took ~7s and stalled the worker.
        payload = "url(" * 16000
        start = time.perf_counter()
        self.assertTrue(_has_unsafe_css(payload))
        elapsed = time.perf_counter() - start
        self.assertLess(elapsed, 1.0, f"scan took {elapsed:.3f}s, expected well under 1s")

    def test_sanitize_svg_checks_root_style_element(self):
        # A .svg filename short-circuits the sniff, so a bare <style> root reaches
        # the sanitizer; it is checked by the same pass as nested ones.
        text = sanitize_svg(b"<style>@import url(http://evil/x.css);</style>").decode("utf-8")
        self.assertNotIn("@import", text)
        self.assertNotIn("http://evil", text)

    def test_sanitize_svg_keeps_safe_root_style_element(self):
        text = sanitize_svg(b"<style>.st0{fill:#FFF}</style>").decode("utf-8")
        self.assertIn("fill:#FFF", text)

    def test_sanitize_svg_rejects_unbalanced_url_in_stylesheet(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<style>.a{background:url(</style>"
            b"</svg>"
        )
        self.assertNotIn("url(", sanitize_svg(svg).decode("utf-8"))

    def test_sanitize_svg_strips_backslash_protocol_relative_hrefs(self):
        # Browsers fold "\" to "/" for special schemes, so "\\evil.com" resolves
        # to "https://evil.com" against the page base.
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<image href="\\\\evil.example/leak.png"/>'
            b'<image href="\\/evil.example/leak.png"/>'
            b'<use href="#safe"/>'
            b"</svg>"
        )
        text = sanitize_svg(svg).decode("utf-8")
        self.assertNotIn("evil.example", text)
        self.assertIn('href="#safe"', text)

    def test_sanitize_svg_keeps_backslash_relative_path(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b'<image href="dir\\icon.png"/>'
            b"</svg>"
        )
        self.assertIn("dir\\icon.png", sanitize_svg(svg).decode("utf-8"))

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

    def test_sanitize_svg_rejects_excessive_nesting(self):
        # RecursionError is not a ValueError, so it would escape as a 500.
        deep = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            + b"<g>" * 5000 + b"<rect/>" + b"</g>" * 5000
            + b"</svg>"
        )
        with self.assertRaisesRegex(ValueError, "nesting exceeds"):
            sanitize_svg(deep)

    def test_sanitize_svg_allows_normal_nesting(self):
        nested = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            + b"<g>" * 100 + b'<g onload="alert(1)"><script>x</script><rect/></g>'
            + b"</g>" * 100 + b"</svg>"
        )
        out = sanitize_svg(nested)
        self.assertNotIn(b"<script", out)
        self.assertNotIn(b"onload", out)
        self.assertIn(b"<rect", out)

    def test_sanitize_svg_rejects_dangerous_root(self):
        with self.assertRaisesRegex(ValueError, "Disallowed root"):
            sanitize_svg(b"<script>alert(1)</script>")
