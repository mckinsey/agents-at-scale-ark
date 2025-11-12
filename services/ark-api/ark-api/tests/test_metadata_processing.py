"""Tests for Ark metadata processing in OpenAI completions."""

import json
from fastapi.responses import JSONResponse

from ark_api.api.v1.openai import process_request_metadata
from ark_api.models.queries import ArkOpenAICompletionsMetadata


def test_process_request_metadata_none():
    """Test processing with no metadata."""
    base_metadata = {"name": "test", "namespace": "default"}
    result = process_request_metadata(None, base_metadata)

    assert result is None
    assert base_metadata == {"name": "test", "namespace": "default"}


def test_process_request_metadata_no_ark():
    """Test processing with metadata but no ark key."""
    base_metadata = {"name": "test", "namespace": "default"}
    request_metadata = {"user_id": "123", "session": "abc"}
    result = process_request_metadata(request_metadata, base_metadata)

    assert result is None
    assert base_metadata == {"name": "test", "namespace": "default"}


def test_process_request_metadata_with_annotations():
    """Test processing with valid ark annotations."""
    base_metadata = {"name": "test", "namespace": "default"}
    ark_data = {"annotations": {"ark.mckinsey.com/a2a-context-id": "abc-123"}}
    request_metadata = {"ark": json.dumps(ark_data)}

    result = process_request_metadata(request_metadata, base_metadata)

    assert result is None
    assert base_metadata["annotations"]["ark.mckinsey.com/a2a-context-id"] == "abc-123"


def test_process_request_metadata_merges_annotations():
    """Test that ark annotations are merged with existing annotations."""
    base_metadata = {
        "name": "test",
        "namespace": "default",
        "annotations": {"existing": "value"}
    }
    ark_data = {"annotations": {"ark.mckinsey.com/new": "annotation"}}
    request_metadata = {"ark": json.dumps(ark_data)}

    result = process_request_metadata(request_metadata, base_metadata)

    assert result is None
    assert base_metadata["annotations"]["existing"] == "value"
    assert base_metadata["annotations"]["ark.mckinsey.com/new"] == "annotation"


def test_process_request_metadata_invalid_json():
    """Test processing with malformed ark JSON."""
    base_metadata = {"name": "test", "namespace": "default"}
    request_metadata = {"ark": "not valid json"}

    result = process_request_metadata(request_metadata, base_metadata)

    assert isinstance(result, JSONResponse)
    assert result.status_code == 400


def test_process_request_metadata_empty_annotations():
    """Test processing with ark but no annotations."""
    base_metadata = {"name": "test", "namespace": "default"}
    ark_data = {"annotations": None}
    request_metadata = {"ark": json.dumps(ark_data)}

    result = process_request_metadata(request_metadata, base_metadata)

    assert result is None
    assert "annotations" not in base_metadata


def test_ark_openai_completions_metadata_model():
    """Test ArkOpenAICompletionsMetadata model validation."""
    # Valid annotations
    metadata = ArkOpenAICompletionsMetadata(
        annotations={"key": "value"}
    )
    assert metadata.annotations == {"key": "value"}

    # No annotations
    metadata = ArkOpenAICompletionsMetadata()
    assert metadata.annotations is None

    # Empty annotations
    metadata = ArkOpenAICompletionsMetadata(annotations={})
    assert metadata.annotations == {}
