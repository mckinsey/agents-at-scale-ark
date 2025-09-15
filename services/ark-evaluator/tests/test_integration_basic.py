"""Basic integration test to verify the implementation works"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from evaluator.providers.event_evaluation import EventEvaluationProvider
from evaluator.types import UnifiedEvaluationRequest, EvaluationConfig, EvaluationType


def test_event_evaluation_provider_init():
    """Test that EventEvaluationProvider can be initialized"""
    provider = EventEvaluationProvider()
    assert provider.get_evaluation_type() == "event"


def test_is_semantic_expression():
    """Test semantic expression detection"""
    provider = EventEvaluationProvider()
    
    # Test semantic expressions
    assert provider._is_semantic_expression("tool.was_called()") == True
    assert provider._is_semantic_expression("agent.was_executed()") == True
    assert provider._is_semantic_expression("query.was_resolved()") == True
    assert provider._is_semantic_expression("sequence.was_completed(['event1', 'event2'])") == True
    
    # Test non-semantic expressions
    assert provider._is_semantic_expression("events.exists(e, e.reason == 'ToolCallComplete')") == False
    assert provider._is_semantic_expression("events.size() > 0") == False
    assert provider._is_semantic_expression("ToolCallComplete") == False


def test_unified_evaluation_request_creation():
    """Test that we can create a UnifiedEvaluationRequest for events"""
    rules = [
        {
            "name": "tool_called",
            "expression": "tool.was_called()",
            "weight": 1
        }
    ]
    
    config = EvaluationConfig(rules=rules)
    request = UnifiedEvaluationRequest(
        type=EvaluationType.EVENT,
        config=config,
        parameters={"query.name": "test-query", "query.namespace": "default"},
        evaluatorName="test-evaluator"
    )
    
    assert request.type == EvaluationType.EVENT
    assert len(request.config.rules) == 1
    assert request.config.rules[0]["expression"] == "tool.was_called()"


def test_basic_pattern_evaluation():
    """Test basic pattern evaluation without async"""
    provider = EventEvaluationProvider()
    
    # Mock events
    events = [
        {"reason": "ToolCallComplete", "message": "test"},
        {"reason": "AgentExecutionStart", "message": "test"}
    ]
    
    # Test simple pattern matching
    assert provider._evaluate_basic_pattern("ToolCallComplete", events) == True
    assert provider._evaluate_basic_pattern("AgentExecutionStart", events) == True
    # Non-existent events fall back to checking if we have any events (which we do)
    assert provider._evaluate_basic_pattern("NonExistentEvent", events) == True
    
    # Test size patterns
    assert provider._evaluate_basic_pattern("events.size() > 0", events) == True
    assert provider._evaluate_basic_pattern("events.size() >= 2", events) == True
    assert provider._evaluate_basic_pattern("events.size() >= 5", events) == False


def test_event_to_dict():
    """Test event conversion to dictionary"""
    provider = EventEvaluationProvider()
    
    # Mock Kubernetes event
    mock_event = MagicMock()
    mock_event.metadata.name = "test-event"
    mock_event.metadata.namespace = "default"
    mock_event.reason = "ToolCallComplete"
    mock_event.message = "Tool call completed"
    mock_event.first_timestamp.isoformat.return_value = "2024-01-01T00:00:00Z"
    mock_event.last_timestamp.isoformat.return_value = "2024-01-01T00:00:01Z"
    mock_event.count = 1
    mock_event.type = "Normal"
    mock_event.involved_object.kind = "Query"
    mock_event.involved_object.name = "test-query"
    mock_event.involved_object.namespace = "default"
    
    result = provider._event_to_dict(mock_event)
    
    assert result["name"] == "test-event"
    assert result["namespace"] == "default"
    assert result["reason"] == "ToolCallComplete"
    assert result["message"] == "Tool call completed"
    assert result["count"] == 1
    assert result["type"] == "Normal"
    assert result["involvedObject"]["kind"] == "Query"


def test_helper_initialization():
    """Test that helpers can be initialized"""
    provider = EventEvaluationProvider()
    provider._initialize_helpers("default", "test-query", "session-123")
    
    # Check that helpers were created
    assert provider.event_analyzer is not None
    assert provider.tool_helper is not None
    assert provider.agent_helper is not None
    assert provider.team_helper is not None
    assert provider.sequence_helper is not None
    assert provider.query_helper is not None
    
    # Check that event analyzer has correct context
    assert provider.event_analyzer.namespace == "default"
    assert provider.event_analyzer.query_name == "test-query"
    assert provider.event_analyzer.session_id == "session-123"