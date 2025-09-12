"""End-to-end test to verify the semantic expression implementation works"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from evaluator.providers.event_evaluation import EventEvaluationProvider
from evaluator.types import UnifiedEvaluationRequest, EvaluationConfig, EvaluationType


def test_semantic_expressions_work_end_to_end():
    """Test that semantic expressions can be detected and would be processed"""
    provider = EventEvaluationProvider()
    
    # Test various semantic expressions
    semantic_expressions = [
        "tool.was_called()",
        "tools.was_called('search')",
        "agent.was_executed()",
        "agents.was_executed('researcher')",
        "query.was_resolved()",
        "query.get_execution_time() <= 30.0",
        "sequence.was_completed(['ResolveStart', 'ResolveComplete'])",
        "team.was_executed()",
        "llm.get_call_count() <= 10"
    ]
    
    for expr in semantic_expressions:
        assert provider._is_semantic_expression(expr), f"Expression '{expr}' should be detected as semantic"
    
    # Test non-semantic expressions
    non_semantic_expressions = [
        "events.exists(e, e.reason == 'ToolCallComplete')",
        "events.size() > 0",
        "ToolCallComplete",
        "events.filter(e, e.reason == 'AgentExecution').size() >= 2"
    ]
    
    for expr in non_semantic_expressions:
        assert not provider._is_semantic_expression(expr), f"Expression '{expr}' should NOT be detected as semantic"


def test_mixed_evaluation_config():
    """Test evaluation configuration with both semantic and CEL expressions"""
    rules = [
        {
            "name": "semantic_tool_check",
            "expression": "tool.was_called()",
            "description": "Check if tools were used (semantic)",
            "weight": 1
        },
        {
            "name": "cel_event_check", 
            "expression": "events.exists(e, e.reason == 'ToolCallComplete')",
            "description": "Check for tool completion events (CEL)",
            "weight": 1
        },
        {
            "name": "simple_pattern",
            "expression": "AgentExecutionComplete",
            "description": "Simple pattern match",
            "weight": 1
        }
    ]
    
    config = EvaluationConfig(rules=rules)
    request = UnifiedEvaluationRequest(
        type=EvaluationType.EVENT,
        config=config,
        parameters={
            "query.name": "test-query",
            "query.namespace": "default",
            "sessionId": "session-123",
            "min-score": "0.7"
        },
        evaluatorName="mixed-evaluator"
    )
    
    assert request.type == EvaluationType.EVENT
    assert len(request.config.rules) == 3
    
    # Verify each rule
    assert request.config.rules[0]["expression"] == "tool.was_called()"
    assert request.config.rules[1]["expression"] == "events.exists(e, e.reason == 'ToolCallComplete')"
    assert request.config.rules[2]["expression"] == "AgentExecutionComplete"


def test_migration_patterns_exist():
    """Test that migration patterns are available for common expressions"""
    from evaluator.helpers.integration_guide import MIGRATION_PATTERNS
    
    cel_to_semantic = MIGRATION_PATTERNS["cel_to_semantic"]
    
    # Check that common patterns have migrations
    expected_migrations = [
        "events.exists(e, e.reason == 'ToolCallComplete')",
        "events.filter(e, e.reason == 'ToolCallComplete').size()", 
        "events.exists(e, e.reason == 'AgentExecutionComplete')",
        "events.exists(e, e.reason == 'ResolveComplete')"
    ]
    
    for pattern in expected_migrations:
        assert pattern in cel_to_semantic, f"Migration pattern missing for: {pattern}"
        
        # Verify the migration is actually semantic
        migration = cel_to_semantic[pattern]
        # Should contain helper method calls
        assert any(helper in migration for helper in ["tool.", "agent.", "query."]), f"Migration '{migration}' should be semantic"


def test_comprehensive_rule_coverage():
    """Test that we have rule patterns for all major event types"""
    rules = [
        # Tool events
        {"name": "tool_usage", "expression": "tool.was_called()"},
        {"name": "tool_success", "expression": "tool.get_success_rate() >= 0.8"},
        
        # Agent events  
        {"name": "agent_execution", "expression": "agent.was_executed()"},
        {"name": "agent_reliability", "expression": "agent.get_success_rate() >= 0.9"},
        
        # Query events
        {"name": "query_resolution", "expression": "query.was_resolved()"},
        {"name": "query_performance", "expression": "query.get_execution_time() <= 30.0"},
        
        # Sequence events
        {"name": "proper_sequence", "expression": "sequence.was_completed(['ResolveStart', 'ResolveComplete'])"},
        
        # Team events
        {"name": "team_execution", "expression": "team.was_executed()"},
        
        # LLM events
        {"name": "llm_efficiency", "expression": "llm.get_call_count() <= 10"},
        
        # Complex combinations
        {"name": "comprehensive_success", "expression": "tool.was_called() and agent.was_executed() and query.was_resolved()"}
    ]
    
    provider = EventEvaluationProvider()
    
    # Verify all rules are detected as semantic
    for rule in rules:
        expression = rule["expression"]
        assert provider._is_semantic_expression(expression), f"Rule '{rule['name']}' expression should be semantic: {expression}"


def test_backward_compatibility_preserved():
    """Test that old CEL expressions still work"""
    provider = EventEvaluationProvider()
    
    # Mock some events
    events = [
        {"reason": "ToolCallComplete", "message": "tool completed"},
        {"reason": "AgentExecutionStart", "message": "agent started"},
        {"reason": "ResolveComplete", "message": "query resolved"}
    ]
    
    # Test CEL-style expressions work
    assert provider._evaluate_basic_pattern("events.exists(e, e.reason == 'ToolCallComplete')", events) == True
    assert provider._evaluate_basic_pattern("events.size() >= 3", events) == True
    assert provider._evaluate_basic_pattern("ToolCallComplete", events) == True
    
    # Test that these are NOT detected as semantic
    assert not provider._is_semantic_expression("events.exists(e, e.reason == 'ToolCallComplete')")
    assert not provider._is_semantic_expression("events.size() >= 3")
    assert not provider._is_semantic_expression("ToolCallComplete")


if __name__ == "__main__":
    # Run tests manually if needed
    test_semantic_expressions_work_end_to_end()
    test_mixed_evaluation_config()
    test_migration_patterns_exist()
    test_comprehensive_rule_coverage()
    test_backward_compatibility_preserved()
    print("✅ All end-to-end tests passed!")