from __future__ import annotations

import unittest
from datetime import datetime, timezone

from ark_api.utils.helpers import parse_iso_timestamp


class TestParseIsoTimestamp(unittest.TestCase):
    def test_none_and_empty_return_none(self):
        self.assertIsNone(parse_iso_timestamp(None))
        self.assertIsNone(parse_iso_timestamp(""))

    def test_iso_string_with_trailing_z(self):
        dt = parse_iso_timestamp("2026-09-25T10:00:00Z")
        self.assertIsNotNone(dt)
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.hour, 10)
        self.assertEqual(dt.tzinfo, timezone.utc)

    def test_iso_string_with_offset(self):
        dt = parse_iso_timestamp("2026-09-25T10:00:00+00:00")
        self.assertIsNotNone(dt)
        self.assertEqual(dt.minute, 0)

    def test_datetime_passthrough(self):
        now = datetime(2026, 9, 25, 12, 0, 0, tzinfo=timezone.utc)
        self.assertIs(parse_iso_timestamp(now), now)

    def test_unparseable_string_returns_none(self):
        self.assertIsNone(parse_iso_timestamp("not-a-timestamp"))

    def test_non_str_non_datetime_returns_none(self):
        self.assertIsNone(parse_iso_timestamp(12345))


if __name__ == "__main__":
    unittest.main()
