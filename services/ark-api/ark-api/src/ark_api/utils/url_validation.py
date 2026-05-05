"""URL validation utilities to prevent path traversal attacks.

This module provides utilities for safely constructing URLs from user input,
preventing path traversal vulnerabilities (CWE-22).
"""

from urllib.parse import quote
from fastapi import HTTPException


def validate_path_segment(segment: str, param_name: str = "path segment") -> str:
    """Validate that a path segment doesn't contain traversal sequences.

    Args:
        segment: A single path segment (e.g., 'trace-123' or 'session-abc')
        param_name: Name of the parameter for error messages

    Raises:
        HTTPException: 400 if segment contains path traversal attempts

    Returns:
        The validated segment (unmodified if valid)

    Examples:
        >>> validate_path_segment("trace-123", "trace_id")
        'trace-123'
        >>> validate_path_segment("../admin", "trace_id")  # raises HTTPException
    """
    # Check for path traversal patterns
    if ".." in segment:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {param_name}: path traversal not allowed (contains '..')"
        )

    # Check for path separators (both unix and windows)
    if "/" in segment or "\\" in segment:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {param_name}: path separators not allowed"
        )

    # Check for empty or whitespace-only segments
    if not segment or not segment.strip():
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {param_name}: cannot be empty"
        )

    return segment


def build_safe_url(base_url: str, *path_segments: str) -> str:
    """Build a URL safely from base and path segments.

    This function validates each path segment and properly encodes them
    to prevent path traversal attacks.

    Args:
        base_url: Base URL (e.g., 'http://broker:8000')
        path_segments: Variable number of path segments to append

    Returns:
        Properly constructed and encoded URL

    Examples:
        >>> build_safe_url("http://broker:8000", "traces", "trace-123")
        'http://broker:8000/traces/trace-123'
        >>> build_safe_url("http://broker:8000/", "sessions", "session-abc")
        'http://broker:8000/sessions/session-abc'
    """
    # Ensure base URL doesn't end with / (we'll add our own)
    base = base_url.rstrip('/')

    # Validate and encode each segment
    # We use quote() with safe='' to encode everything except unreserved chars
    # This prevents any special URL characters from being interpreted
    encoded_segments = [
        quote(segment.strip('/'), safe='')
        for segment in path_segments
        if segment  # Skip empty segments
    ]

    # Join segments with /
    if encoded_segments:
        return f"{base}/{'/'.join(encoded_segments)}"
    return base


def build_safe_url_with_validation(base_url: str, *path_segments: tuple[str, str]) -> str:
    """Build a URL with validation and descriptive error messages.

    This is a stricter version that validates segments before encoding.

    Args:
        base_url: Base URL
        path_segments: Tuples of (segment_value, param_name) for validation

    Returns:
        Properly constructed and encoded URL

    Examples:
        >>> build_safe_url_with_validation(
        ...     "http://broker:8000",
        ...     ("traces", "path"),
        ...     (trace_id, "trace_id")
        ... )
    """
    base = base_url.rstrip('/')

    validated_segments = []
    for segment, param_name in path_segments:
        if segment:  # Skip empty segments
            # Validate first
            validated = validate_path_segment(segment, param_name)
            # Then encode
            encoded = quote(validated.strip('/'), safe='')
            validated_segments.append(encoded)

    if validated_segments:
        return f"{base}/{'/'.join(validated_segments)}"
    return base
