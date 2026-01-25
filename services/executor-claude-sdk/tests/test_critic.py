"""Tests for critic module."""

import pytest
from claude_sdk_executor.critic.inline import evaluate_critic_response
from claude_sdk_executor.critic.base import CriticResult


class TestEvaluateCriticResponse:
    """Tests for evaluate_critic_response function."""

    def test_approved_uppercase(self):
        """Test detecting APPROVED in uppercase."""
        assert evaluate_critic_response("APPROVED") is True
        assert evaluate_critic_response("The changes look good. APPROVED.") is True

    def test_approved_lowercase(self):
        """Test detecting approved in lowercase."""
        assert evaluate_critic_response("approved") is True
        assert evaluate_critic_response("Changes approved.") is True

    def test_approved_mixed_case(self):
        """Test detecting Approved in mixed case."""
        assert evaluate_critic_response("Approved") is True

    def test_needs_revision(self):
        """Test detecting rejection."""
        assert evaluate_critic_response("NEEDS_REVISION: Please fix the tests.") is False
        assert evaluate_critic_response("The code needs work.") is False

    def test_custom_pattern(self):
        """Test custom pass patterns."""
        assert evaluate_critic_response("LGTM", pass_pattern="LGTM") is True
        assert evaluate_critic_response("Looks good to me!", pass_pattern="LGTM|looks good") is True
        assert evaluate_critic_response("OK", pass_pattern="^OK$") is True

    def test_empty_response(self):
        """Test empty response returns False."""
        assert evaluate_critic_response("") is False
        assert evaluate_critic_response("   ") is False


class TestCriticResult:
    """Tests for CriticResult dataclass."""

    def test_passed_result(self):
        """Test creating a passed result."""
        result = CriticResult(passed=True, score=1.0)
        
        assert result.passed is True
        assert result.score == 1.0
        assert result.feedback == ""

    def test_failed_result_with_feedback(self):
        """Test creating a failed result with feedback."""
        result = CriticResult(
            passed=False,
            score=0.0,
            feedback="Tests are failing. Please fix."
        )
        
        assert result.passed is False
        assert result.score == 0.0
        assert result.feedback == "Tests are failing. Please fix."

    def test_result_with_metadata(self):
        """Test creating a result with metadata."""
        result = CriticResult(
            passed=True,
            score=0.95,
            metadata={"tests_passed": True, "lint_clean": True}
        )
        
        assert result.metadata["tests_passed"] is True
        assert result.metadata["lint_clean"] is True
