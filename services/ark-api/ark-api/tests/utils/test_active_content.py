import unittest

from ark_api.utils.active_content import (
    assert_declared_type,
    declared_active_type,
    detect_active_content,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
HTML = b"<!DOCTYPE html><html><body><script>alert(1)</script></body></html>"
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
PDF = b"%PDF-1.7\n1 0 obj\n"
DOCX = b"PK\x03\x04\x14\x00\x06\x00"
RTF = b"{\\rtf1\\ansi test}"
ELF = b"\x7fELF\x02\x01\x01\x00"
PE = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00"


class TestDetectActiveContent(unittest.TestCase):
    def test_detects_each_active_family(self):
        for content, expected in (
            (HTML, "html"),
            (SVG, "svg"),
            (PDF, "pdf"),
            (DOCX, "zip"),
            (RTF, "rtf"),
            (ELF, "executable"),
            (PE, "executable"),
        ):
            with self.subTest(expected=expected):
                self.assertEqual(detect_active_content(content), expected)

    def test_inert_content_is_not_flagged(self):
        for content in (PNG, b"just some notes", b"a,b,c\n1,2,3\n", b"", b"{\"k\": 1}"):
            with self.subTest(content=content[:16]):
                self.assertIsNone(detect_active_content(content))

    def test_prose_mentioning_markup_is_not_html(self):
        # Start-anchored on purpose: docs that discuss HTML must still upload.
        self.assertIsNone(detect_active_content(b"# Notes\n\nUse <html> to open a document.\n"))
        self.assertIsNone(detect_active_content(b"See the <script> tag for details."))

    def test_detects_html_behind_bom_and_xml_declaration(self):
        self.assertEqual(detect_active_content(b"\xef\xbb\xbf" + HTML), "html")
        self.assertEqual(
            detect_active_content(b'<?xml version="1.0"?><html xmlns="x"><body/></html>'),
            "html",
        )

    def test_text_starting_with_mz_is_not_an_executable(self):
        # "MZ" alone is two printable bytes; a real DOS header carries NULs.
        self.assertIsNone(detect_active_content(b"MZ Consulting quarterly report"))


class TestDeclaredActiveType(unittest.TestCase):
    def test_extension_drives_the_declared_type(self):
        self.assertEqual(declared_active_type("a.html", None), "html")
        self.assertEqual(declared_active_type("a.SVG", None), "svg")
        self.assertEqual(declared_active_type("a.pdf", None), "pdf")
        self.assertEqual(declared_active_type("a.docx", None), "zip")
        self.assertEqual(declared_active_type("a.xlsx", None), "zip")
        self.assertEqual(declared_active_type("a.epub", None), "zip")
        self.assertIsNone(declared_active_type("a.png", None))
        self.assertIsNone(declared_active_type("notes.txt", None))

    def test_filename_wins_over_content_type(self):
        # Otherwise "x.png" + "Content-Type: text/html" would declare itself html and
        # match its own payload, which is exactly the disguise being blocked.
        self.assertIsNone(declared_active_type("x.png", "text/html"))

    def test_content_type_used_only_when_unnamed(self):
        self.assertEqual(declared_active_type(None, "text/html"), "html")
        self.assertEqual(declared_active_type(None, "image/svg+xml; charset=utf-8"), "svg")
        self.assertIsNone(declared_active_type(None, "image/png"))
        self.assertIsNone(declared_active_type(None, None))


class TestAssertDeclaredType(unittest.TestCase):
    def test_rejects_active_content_declared_as_inert(self):
        with self.assertRaisesRegex(ValueError, "content is html"):
            assert_declared_type("report.png", "image/png", HTML)

    def test_rejects_active_content_declared_as_another_active_type(self):
        with self.assertRaisesRegex(ValueError, "content is html"):
            assert_declared_type("invoice.pdf", "application/pdf", HTML)

    def test_allows_matching_declarations(self):
        assert_declared_type("page.html", "text/html", HTML)
        assert_declared_type("icon.svg", "image/svg+xml", SVG)
        assert_declared_type("doc.pdf", "application/pdf", PDF)
        assert_declared_type("sheet.xlsx", None, DOCX)

    def test_allows_inert_content_whatever_it_claims(self):
        assert_declared_type("photo.png", "image/png", PNG)
        assert_declared_type("notes.txt", "text/plain", b"plain notes")
        assert_declared_type("data.csv", None, b"a,b\n1,2\n")
