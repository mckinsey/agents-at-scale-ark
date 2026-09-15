"""Tests for LOG_LEVEL resolution in the ark-mcp entry point.

Mirrors the ark-api ``_resolve_level`` tests so both services' verbose-logging
switch (the Logging Contract's DEBUG toggle) is covered symmetrically.
"""
from __future__ import annotations

import logging
import unittest
from unittest import mock

from ark_mcp.__main__ import _resolve_level


class TestResolveLevel(unittest.TestCase):
    def test_default_is_info_when_unset(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertEqual(_resolve_level(), logging.INFO)

    def test_debug_env(self):
        with mock.patch.dict("os.environ", {"LOG_LEVEL": "DEBUG"}, clear=True):
            self.assertEqual(_resolve_level(), logging.DEBUG)

    def test_case_insensitive(self):
        with mock.patch.dict("os.environ", {"LOG_LEVEL": "debug"}, clear=True):
            self.assertEqual(_resolve_level(), logging.DEBUG)

    def test_whitespace_is_stripped(self):
        with mock.patch.dict("os.environ", {"LOG_LEVEL": "  WARNING  "}, clear=True):
            self.assertEqual(_resolve_level(), logging.WARNING)

    def test_invalid_falls_back_to_info(self):
        with mock.patch.dict("os.environ", {"LOG_LEVEL": "NOPE"}, clear=True):
            self.assertEqual(_resolve_level(), logging.INFO)


if __name__ == "__main__":
    unittest.main()
