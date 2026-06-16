import pytest
from fastapi import HTTPException

from ark_api.utils.url_validation import (
    validate_path_segment,
    build_safe_url,
    validate_and_build_url,
)


class TestValidatePathSegment:
    """Tests for validate_path_segment function."""

    def test_valid_segment(self):
        """Valid segments should pass through unchanged."""
        assert validate_path_segment("trace-123", "trace_id") == "trace-123"
        assert validate_path_segment("session-abc", "session_id") == "session-abc"
        assert validate_path_segment("abc123", "id") == "abc123"

    def test_rejects_path_traversal(self):
        """Should reject segments with .. path traversal."""
        with pytest.raises(HTTPException) as exc:
            validate_path_segment("../admin", "path")
        assert exc.value.status_code == 400
        assert "path traversal" in exc.value.detail.lower()

    def test_rejects_forward_slash(self):
        """Should reject segments with forward slashes."""
        with pytest.raises(HTTPException) as exc:
            validate_path_segment("path/to/file", "path")
        assert exc.value.status_code == 400
        assert "path separators" in exc.value.detail.lower()

    def test_rejects_backslash(self):
        """Should reject segments with backslashes."""
        with pytest.raises(HTTPException) as exc:
            validate_path_segment("path\\to\\file", "path")
        assert exc.value.status_code == 400
        assert "path separators" in exc.value.detail.lower()

    def test_rejects_empty_segment(self):
        """Should reject empty or whitespace-only segments."""
        with pytest.raises(HTTPException) as exc:
            validate_path_segment("", "path")
        assert exc.value.status_code == 400
        assert "cannot be empty" in exc.value.detail.lower()

        with pytest.raises(HTTPException) as exc:
            validate_path_segment("   ", "path")
        assert exc.value.status_code == 400


class TestBuildSafeUrl:
    """Tests for build_safe_url function."""

    def test_single_segment(self):
        """Should build URL with single path segment."""
        url = build_safe_url("http://broker:8000", "traces")
        assert url == "http://broker:8000/traces"

    def test_multiple_segments(self):
        """Should build URL with multiple path segments."""
        url = build_safe_url("http://broker:8000", "traces", "trace-123")
        assert url == "http://broker:8000/traces/trace-123"

    def test_no_segments(self):
        """Should return base URL when no segments provided."""
        url = build_safe_url("http://broker:8000")
        assert url == "http://broker:8000"

    def test_strips_trailing_slash_from_base(self):
        """Should strip trailing slash from base URL."""
        url = build_safe_url("http://broker:8000/", "traces")
        assert url == "http://broker:8000/traces"

    def test_encodes_special_characters(self):
        """Should URL-encode special characters in segments."""
        url = build_safe_url("http://broker:8000", "trace with spaces")
        assert "trace%20with%20spaces" in url

    def test_skips_empty_segments(self):
        """Should skip empty segments."""
        url = build_safe_url("http://broker:8000", "traces", "", "trace-123")
        assert url == "http://broker:8000/traces/trace-123"


class TestValidateAndBuildUrl:
    """Tests for validate_and_build_url helper function."""

    def test_valid_single_segment_path(self):
        """Should handle single segment path."""
        url = validate_and_build_url("http://broker:8000", "/traces")
        assert url == "http://broker:8000/traces"

    def test_valid_multi_segment_path(self):
        """Should handle multi-segment path."""
        url = validate_and_build_url("http://broker:8000", "/sessions/abc-123")
        assert url == "http://broker:8000/sessions/abc-123"

    def test_none_path(self):
        """Should return base URL when path is None."""
        url = validate_and_build_url("http://broker:8000", None)
        assert url == "http://broker:8000"

    def test_empty_string_path(self):
        """Should return base URL when path is empty string."""
        url = validate_and_build_url("http://broker:8000", "")
        assert url == "http://broker:8000"

    def test_path_with_leading_slash(self):
        """Should handle paths with leading slash."""
        url = validate_and_build_url("http://broker:8000", "/traces")
        assert url == "http://broker:8000/traces"

    def test_path_with_multiple_slashes(self):
        """Should handle paths with multiple slashes."""
        url = validate_and_build_url("http://broker:8000", "/traces//123")
        assert url == "http://broker:8000/traces/123"

    def test_rejects_path_traversal(self):
        """Should reject paths with path traversal attempts."""
        with pytest.raises(HTTPException) as exc:
            validate_and_build_url("http://broker:8000", "/traces/../admin")
        assert exc.value.status_code == 400
        assert "path traversal" in exc.value.detail.lower()

    def test_rejects_double_dot_segment(self):
        """Should reject paths with .. segments."""
        with pytest.raises(HTTPException) as exc:
            validate_and_build_url("http://broker:8000", "/../../../etc/passwd")
        assert exc.value.status_code == 400

    def test_real_world_trace_path(self):
        """Should handle real-world trace paths."""
        url = validate_and_build_url("http://broker:8000", "/traces")
        assert url == "http://broker:8000/traces"

    def test_real_world_session_path(self):
        """Should handle real-world session paths."""
        url = validate_and_build_url("http://broker:8000", "/sessions/uuid-1234")
        assert url == "http://broker:8000/sessions/uuid-1234"
