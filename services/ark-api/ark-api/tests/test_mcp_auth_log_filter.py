"""Tests for the MCP auth sensitive data logging filter."""
from __future__ import annotations

import logging
import unittest

from ark_api.services.mcp_auth_log_filter import SensitiveDataFilter, _redact_string


class TestRedactString(unittest.TestCase):
    def test_redacts_access_token(self):
        result = _redact_string("access_token=secret123")
        self.assertNotIn("secret123", result)
        self.assertIn("[REDACTED]", result)

    def test_redacts_refresh_token(self):
        result = _redact_string("refresh_token=rtok456")
        self.assertNotIn("rtok456", result)

    def test_redacts_client_secret(self):
        result = _redact_string("client_secret=csec789")
        self.assertNotIn("csec789", result)

    def test_preserves_non_sensitive(self):
        result = _redact_string("client_id=safe_value")
        self.assertIn("safe_value", result)

    def test_redacts_code_verifier(self):
        result = _redact_string("code_verifier=abcdef")
        self.assertNotIn("abcdef", result)


class TestSensitiveDataFilter(unittest.TestCase):
    def test_filter_redacts_msg(self):
        f = SensitiveDataFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Got access_token=secret123 from IdP",
            args=None, exc_info=None,
        )
        f.filter(record)
        self.assertNotIn("secret123", record.msg)

    def test_filter_redacts_dict_args(self):
        f = SensitiveDataFilter()
        record = logging.makeLogRecord({
            "msg": "Token exchange result: %(access_token)s",
            "args": {"access_token": "DO-NOT-LEAK"},
        })
        f.filter(record)
        self.assertEqual(record.args["access_token"], "[REDACTED]")

    def test_sentinel_tokens_never_appear_in_log_output(self):
        f = SensitiveDataFilter()
        handler = logging.StreamHandler()
        handler.addFilter(f)
        test_logger = logging.getLogger("test_sentinel")
        test_logger.addHandler(handler)
        test_logger.setLevel(logging.DEBUG)

        sentinels = [
            "SENTINEL-ACCESS-TOKEN",
            "SENTINEL-REFRESH-TOKEN",
            "SENTINEL-CLIENT-SECRET",
            "SENTINEL-CODE-VERIFIER",
        ]

        records = []
        old_emit = handler.emit

        def capture_emit(record):
            records.append(handler.format(record))

        handler.emit = capture_emit

        test_logger.info("access_token=%s" % sentinels[0])
        test_logger.info("refresh_token=%s" % sentinels[1])
        test_logger.info("client_secret=%s" % sentinels[2])
        test_logger.info("code_verifier=%s" % sentinels[3])

        joined = "\n".join(records)
        for sentinel in sentinels:
            self.assertNotIn(sentinel, joined, f"Sentinel {sentinel!r} leaked into logs")

        handler.emit = old_emit
        test_logger.removeHandler(handler)


if __name__ == "__main__":
    unittest.main()
