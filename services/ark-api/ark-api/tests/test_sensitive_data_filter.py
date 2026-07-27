"""Tests for the sensitive data logging filter."""
from __future__ import annotations

import logging
import sys
import unittest

from ark_api.services.sensitive_data_filter import SensitiveDataFilter, _redact_string


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

    def test_redacts_scheme_prefixed_bearer_token(self):
        # The token after the scheme must be redacted, not just "Bearer".
        result = _redact_string("authorization: Bearer eyJhbGci.token.sig")
        self.assertNotIn("eyJhbGci.token.sig", result)
        self.assertIn("[REDACTED]", result)

    def test_redaction_stops_at_delimiter(self):
        # Redaction must not swallow adjacent structured fields.
        result = _redact_string("access_token=abc123, request_id=r-42")
        self.assertNotIn("abc123", result)
        self.assertIn("request_id=r-42", result)


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
        # %(key)s dict-style args: scrubbed by key before the record is rendered.
        f = SensitiveDataFilter()
        record = logging.makeLogRecord({
            "msg": "Token exchange result: %(access_token)s",
            "args": {"access_token": "DO-NOT-LEAK"},
        })
        f.filter(record)
        self.assertNotIn("DO-NOT-LEAK", record.getMessage())
        self.assertIn("[REDACTED]", record.getMessage())

    def test_positional_arg_with_adjacent_key_is_redacted(self):
        # Case 2a: rendering first avoids the old TypeError-at-emit (which dumped
        # the raw token to stderr) and redacts the value.
        f = SensitiveDataFilter()
        record = logging.LogRecord(
            name="svc", level=logging.INFO, pathname="", lineno=0,
            msg="access_token=%s", args=("LEAKVALUE",), exc_info=None,
        )
        f.filter(record)
        rendered = record.getMessage()  # must not raise
        self.assertNotIn("LEAKVALUE", rendered)
        self.assertIn("[REDACTED]", rendered)

    def test_bare_positional_value_is_not_redacted_documented_limitation(self):
        # Case 2b: a lone value with no adjacent key can't be recognised. Pins the
        # documented boundary; if ever fixed, update the Logging Contract.
        f = SensitiveDataFilter()
        record = logging.LogRecord(
            name="svc", level=logging.INFO, pathname="", lineno=0,
            msg="token exchange done for %s", args=("BARE-VALUE",), exc_info=None,
        )
        f.filter(record)
        self.assertIn("BARE-VALUE", record.getMessage())

    def test_nested_dict_args_are_redacted(self):
        # Case 4: credentials embedded in nested structures must still be scrubbed.
        f = SensitiveDataFilter()
        record = logging.LogRecord(
            name="svc", level=logging.INFO, pathname="", lineno=0,
            msg="params: %s",
            args=({"outer": {"access_token": "NESTED-LEAK"}},),
            exc_info=None,
        )
        f.filter(record)
        self.assertNotIn("NESTED-LEAK", record.getMessage())
        self.assertIn("[REDACTED]", record.getMessage())

    def test_exception_traceback_is_redacted(self):
        # Case 6: creds in an exception message / traceback must be redacted too.
        f = SensitiveDataFilter()
        try:
            raise ValueError("token exchange failed: access_token=EXC-LEAK")
        except ValueError:
            record = logging.LogRecord(
                name="svc", level=logging.ERROR, pathname="", lineno=0,
                msg="request failed", args=None, exc_info=sys.exc_info(),
            )
        f.filter(record)
        self.assertIsNotNone(record.exc_text)
        self.assertNotIn("EXC-LEAK", record.exc_text)
        self.assertIn("[REDACTED]", record.exc_text)

    def test_uvicorn_access_record_keeps_tuple_and_redacts_query_string(self):
        # Case 7: the args tuple must survive (unpacked positionally) while the
        # query-string credential in the URL is scrubbed.
        f = SensitiveDataFilter()
        record = logging.LogRecord(
            name="uvicorn.access", level=logging.INFO, pathname="", lineno=0,
            msg='%s - "%s %s HTTP/%s" %d',
            args=("1.2.3.4", "GET", "/cb?access_token=URL-LEAK", "1.1", 200),
            exc_info=None,
        )
        f.filter(record)
        self.assertIsInstance(record.args, tuple)
        self.assertEqual(len(record.args), 5)
        self.assertEqual(record.args[4], 200)
        self.assertNotIn("URL-LEAK", record.getMessage())
        self.assertIn("[REDACTED]", record.getMessage())

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
