from __future__ import annotations

import pytest
from ark_api.utils.parse_duration import parse_duration_to_seconds


class TestParseDurationToSeconds:
    """Tests for parse_duration_to_seconds - matches K8s duration format exactly."""

    def test_seconds_only(self):
        assert parse_duration_to_seconds("30s") == 30
        assert parse_duration_to_seconds("0s") == 0

    def test_minutes_only(self):
        assert parse_duration_to_seconds("5m") == 300
        assert parse_duration_to_seconds("1m") == 60

    def test_hours_only(self):
        assert parse_duration_to_seconds("1h") == 3600
        assert parse_duration_to_seconds("2h") == 7200

    def test_milliseconds(self):
        assert parse_duration_to_seconds("500ms") == 0
        assert parse_duration_to_seconds("1000ms") == 1

    def test_k8s_compound_format(self):
        assert parse_duration_to_seconds("5m0s") == 300
        assert parse_duration_to_seconds("30m0s") == 1800
        assert parse_duration_to_seconds("1h0m0s") == 3600
        assert parse_duration_to_seconds("1h30m0s") == 5400
        assert parse_duration_to_seconds("1h30m45s") == 5445

    def test_none_input(self):
        assert parse_duration_to_seconds(None) is None

    def test_empty_string(self):
        assert parse_duration_to_seconds("") is None

    def test_whitespace_only(self):
        assert parse_duration_to_seconds("   ") is None

    def test_whitespace_handling(self):
        assert parse_duration_to_seconds("  5m  ") == 300
        assert parse_duration_to_seconds(" 30s ") == 30

    def test_invalid_format_raises(self):
        with pytest.raises(ValueError, match="Invalid duration format"):
            parse_duration_to_seconds("invalid")
        with pytest.raises(ValueError, match="Invalid duration format"):
            parse_duration_to_seconds("5")
        with pytest.raises(ValueError, match="Invalid duration format"):
            parse_duration_to_seconds("5x")
        with pytest.raises(ValueError, match="Invalid duration format"):
            parse_duration_to_seconds("m5")

    def test_days_rejected_like_k8s(self):
        with pytest.raises(ValueError, match="Invalid duration format"):
            parse_duration_to_seconds("1d")
