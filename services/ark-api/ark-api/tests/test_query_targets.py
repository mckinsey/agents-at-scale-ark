"""Tests for query target utilities."""
import os
import unittest
from fastapi import HTTPException
from src.ark_api.utils.query_targets import parse_model_to_query_target

# Set environment variable to skip authentication before importing the app
os.environ["AUTH_MODE"] = "open"


class TestParseModelToQueryTarget(unittest.TestCase):
    """Tests for parse_model_to_query_target function."""

    def test_parse_agent_model(self):
        """Test parsing agent/ prefix."""
        result = parse_model_to_query_target("agent/test-agent")
        self.assertEqual(result.type, "agent")
        self.assertEqual(result.name, "test-agent")

    def test_parse_team_model(self):
        """Test parsing team/ prefix."""
        result = parse_model_to_query_target("team/test-team")
        self.assertEqual(result.type, "team")
        self.assertEqual(result.name, "test-team")

    def test_parse_model_model(self):
        """Test parsing model/ prefix."""
        result = parse_model_to_query_target("model/test-model")
        self.assertEqual(result.type, "model")
        self.assertEqual(result.name, "test-model")

    def test_parse_tool_model(self):
        """Test parsing tool/ prefix."""
        result = parse_model_to_query_target("tool/test-tool")
        self.assertEqual(result.type, "tool")
        self.assertEqual(result.name, "test-tool")

    def test_invalid_prefix_raises_error(self):
        """Test that invalid prefix raises HTTPException."""
        with self.assertRaises(HTTPException) as context:
            parse_model_to_query_target("invalid/test")
        
        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("Model must be in format", context.exception.detail)

    def test_no_prefix_raises_error(self):
        """Test that no prefix raises HTTPException."""
        with self.assertRaises(HTTPException) as context:
            parse_model_to_query_target("test-model")
        
        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("Model must be in format", context.exception.detail)