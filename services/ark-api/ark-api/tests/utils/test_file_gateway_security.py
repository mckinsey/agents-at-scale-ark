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


def test_file_gateway_route_detection():
    assert is_file_gateway_upload("file-gateway-api", "POST", "files")
    assert is_file_gateway_upload("file-gateway-api", "POST", "files/")
    assert not is_file_gateway_upload("file-gateway-api", "GET", "files")
    assert is_file_gateway_download("file-gateway-api", "GET", "docs/icon.svg/download")
    assert not is_file_gateway_download("file-gateway-api", "GET", "docs/icon.svg")


def test_sanitize_multipart_upload_strips_script():
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

    assert b"<script" not in sanitized_body.lower()
    assert b"onload=" not in sanitized_body.lower()


def test_secure_download_adds_attachment_headers():
    content, headers = secure_file_gateway_download(
        MALICIOUS_SVG,
        {"content-type": "image/svg+xml"},
        "uploads/x.svg/download",
    )

    assert b"<script" not in content.lower()
    assert headers["Content-Disposition"].startswith("attachment;")
    assert "script-src 'none'" in headers["Content-Security-Policy"]
    assert headers["X-Content-Type-Options"] == "nosniff"


def test_secure_download_forces_attachment_for_non_svg():
    html = b"<html><body><script>alert(document.domain)</script></body></html>"
    content, headers = secure_file_gateway_download(
        html,
        {"content-type": "text/html"},
        "uploads/page.html/download",
    )

    # Content is passed through unchanged for non-SVG, but the browser is forced
    # to save it rather than render it, so the embedded script cannot execute.
    assert content == html
    assert headers["Content-Disposition"].startswith('attachment; filename="page.html"')
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert "Content-Security-Policy" not in headers


def test_secure_download_neutralizes_malicious_filename():
    # Attacker-controlled name with quotes + CRLF (url-decoded from the path).
    path = 'uploads/' + quote('x".svg\r\nSet-Cookie: p=1') + '/download'
    _, headers = secure_file_gateway_download(
        b'<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        {"content-type": "image/svg+xml"},
        path,
    )

    disposition = headers["Content-Disposition"]
    # No CR/LF (no header injection) and the attacker's quote is neutralized, so
    # only the two wrapping quotes of filename="..." remain — the name cannot
    # break out of its value or start a new header.
    assert "\r" not in disposition and "\n" not in disposition
    assert disposition.count('"') == 2
    assert disposition.startswith('attachment; filename="')
