import unittest
from urllib.parse import quote

from ark_api.utils.file_gateway_security import (
    is_file_gateway_download,
    is_file_gateway_upload,
    sanitize_file_gateway_upload,
    secure_file_gateway_download,
)

MALICIOUS_SVG = b"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)">
  <script>alert(1)</script>
</svg>
"""


class TestFileGatewaySecurity(unittest.TestCase):
    def test_file_gateway_route_detection(self):
        self.assertTrue(is_file_gateway_upload("file-gateway-api", "POST", "files"))
        self.assertTrue(is_file_gateway_upload("file-gateway-api", "POST", "files/"))
        self.assertFalse(is_file_gateway_upload("file-gateway-api", "GET", "files"))
        self.assertTrue(
            is_file_gateway_download("file-gateway-api", "GET", "docs/icon.svg/download")
        )
        self.assertFalse(
            is_file_gateway_download("file-gateway-api", "GET", "docs/icon.svg")
        )

    def test_sanitize_multipart_upload_strips_script(self):
        boundary = "abc123"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="prefix"\r\n\r\n'
            "uploads\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="x.svg"\r\n'
            "Content-Type: image/svg+xml\r\n\r\n"
        ).encode() + MALICIOUS_SVG + f"\r\n--{boundary}--\r\n".encode()

        sanitized_body = sanitize_file_gateway_upload(
            body,
            f"multipart/form-data; boundary={boundary}",
        )

        self.assertNotIn(b"<script", sanitized_body.lower())
        self.assertNotIn(b"onload=", sanitized_body.lower())

    def test_sanitize_upload_handles_all_name_parameter_forms(self):
        # RFC 2045 allows an unquoted token and spaces around "="; both bypassed the match.
        for disposition in (
            b'Content-Disposition: form-data; name="file"; filename="x.svg"',
            b"Content-Disposition: form-data; name='file'; filename='x.svg'",
            b"Content-Disposition: form-data; name=file; filename=x.svg",
            b'Content-Disposition: form-data; name = "file"; filename="x.svg"',
            b'Content-Disposition: form-data; name="upload"; filename="x.svg"',
        ):
            body = (
                b"--B\r\n" + disposition + b"\r\nContent-Type: image/svg+xml\r\n\r\n"
                + MALICIOUS_SVG + b"\r\n--B--\r\n"
            )
            sanitized = sanitize_file_gateway_upload(
                body, "multipart/form-data; boundary=B"
            )
            with self.subTest(disposition=disposition):
                self.assertNotIn(b"<script", sanitized.lower())
                self.assertNotIn(b"onload=", sanitized.lower())

    def test_sanitize_upload_leaves_non_svg_parts_untouched(self):
        # Safe only because SVG detection is a root-element check.
        body = (
            b'--B\r\nContent-Disposition: form-data; name="prefix"\r\n\r\nuploads\r\n'
            b'--B\r\nContent-Disposition: form-data; name="note"\r\n\r\n'
            b"<html><p>svg rocks</p><br></html>\r\n"
            b'--B\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n'
            b"Content-Type: image/png\r\n\r\n\x89PNG\r\n\x1a\n\r\n--B--\r\n"
        )

        self.assertEqual(
            sanitize_file_gateway_upload(body, "multipart/form-data; boundary=B"),
            body,
        )

    def test_secure_download_adds_attachment_headers(self):
        content, headers = secure_file_gateway_download(
            MALICIOUS_SVG,
            {"content-type": "image/svg+xml"},
            "uploads/x.svg/download",
        )

        self.assertNotIn(b"<script", content.lower())
        self.assertTrue(headers["Content-Disposition"].startswith("attachment;"))
        self.assertIn("script-src 'none'", headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

    def test_secure_download_forces_attachment_for_non_svg(self):
        html = b"<html><body><script>alert(document.domain)</script></body></html>"
        content, headers = secure_file_gateway_download(
            html,
            {"content-type": "text/html"},
            "uploads/page.html/download",
        )

        # Content is passed through unchanged for non-SVG, but the browser is forced
        # to save it rather than render it, so the embedded script cannot execute.
        self.assertEqual(content, html)
        self.assertTrue(
            headers["Content-Disposition"].startswith('attachment; filename="page.html"')
        )
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertNotIn("Content-Security-Policy", headers)

    def test_secure_download_neutralizes_malicious_filename(self):
        # Attacker-controlled name with quotes + CRLF (url-decoded from the path).
        path = "uploads/" + quote('x".svg\r\nSet-Cookie: p=1') + "/download"
        _, headers = secure_file_gateway_download(
            b'<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            {"content-type": "image/svg+xml"},
            path,
        )

        disposition = headers["Content-Disposition"]
        # No CR/LF (no header injection) and the attacker's quote is neutralized, so
        # only the two wrapping quotes of filename="..." remain — the name cannot
        # break out of its value or start a new header.
        self.assertNotIn("\r", disposition)
        self.assertNotIn("\n", disposition)
        self.assertEqual(disposition.count('"'), 2)
        self.assertTrue(disposition.startswith('attachment; filename="'))

    def test_secure_download_neutralizes_active_content_type(self):
        # The preview blobs non-svg images with the response type, so text/html executes.
        _, headers = secure_file_gateway_download(
            b"<html><script>alert(1)</script></html>",
            {"content-type": "text/html"},
            "uploads/x.png/download",
        )

        self.assertEqual(headers["content-type"], "application/octet-stream")
        self.assertEqual(len([k for k in headers if k.lower() == "content-type"]), 1)

    def test_secure_download_preserves_real_image_content_type(self):
        # Downgrading every type would break the <img> preview.
        _, headers = secure_file_gateway_download(
            b"\x89PNG\r\n",
            {"content-type": "image/png"},
            "uploads/a.png/download",
        )

        self.assertEqual(headers["content-type"], "image/png")
