"""Final validation test for the semantic expression implementation"""

import pytest
from evaluator.providers.event_evaluation import EventEvaluationProvider
from evaluator.types import UnifiedEvaluationRequest, EvaluationConfig, EvaluationType


def test_semantic_expressions_implementation():
    """Test that semantic expressions are properly implemented"""
    provider = EventEvaluationProvider()
    
    # Test semantic expression detection
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
        assert provider._is_semantic_expression(expr), f"Failed to detect semantic: {expr}"
    
    # Test non-semantic expressions
    non_semantic_expressions = [
        "events.exists(e, e.reason == 'ToolCallComplete')",
        "events.size() > 0",
        "ToolCallComplete",
        "AgentExecutionStart",
        "events.filter(e, e.reason == 'ToolCallComplete').size() >= 2"
    ]
    
    for expr in non_semantic_expressions:
        assert not provider._is_semantic_expression(expr), f"Incorrectly detected as semantic: {expr}"


def test_helper_initialization():
    """Test that all helper classes can be initialized"""
    provider = EventEvaluationProvider()
    provider._initialize_helpers("default", "test-query", "test-session")
    
    # Verify all helpers are created
    assert provider.event_analyzer is not None
    assert provider.tool_helper is not None
    assert provider.agent_helper is not None
    assert provider.team_helper is not None
    assert provider.llm_helper is not None
    assert provider.sequence_helper is not None
    assert provider.query_helper is not None
    
    # Verify context is correct
    assert provider.event_analyzer.namespace == "default"
    assert provider.event_analyzer.query_name == "test-query" 
    assert provider.event_analyzer.session_id == "test-session"


def test_evaluation_request_creation():
    """Test creating evaluation requests with semantic expressions"""
    rules = [
        {
            "name": "tool_usage",
            "expression": "tool.was_called()",
            "description": "Check if tools were used",
            "weight": 1
        },
        {
            "name": "agent_execution", 
            "expression": "agent.was_executed()",
            "description": "Check if agent was executed",
            "weight": 2
        },
        {
            "name": "query_success",
            "expression": "query.was_resolved()",
            "description": "Check if query was resolved",
            "weight": 3
        },
        {
            "name": "backward_compat",
            "expression": "events.exists(e, e.reason == 'ToolCallComplete')",
            "description": "Backward compatible CEL expression",
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
            "sessionId": "test-session",
            "min-score": "0.7"
        },
        evaluatorName="final-test-evaluator"
    )
    
    assert request.type == EvaluationType.EVENT
    assert len(request.config.rules) == 4
    assert request.evaluatorName == "final-test-evaluator"
    assert request.parameters["min-score"] == "0.7"


def test_basic_pattern_evaluation():
    """Test basic pattern evaluation functionality"""
    provider = EventEvaluationProvider()
    
    # Mock events
    events = [
        {"reason": "ToolCallComplete", "message": "tool completed"},
        {"reason": "AgentExecutionStart", "message": "agent started"},
        {"reason": "ResolveComplete", "message": "query resolved"}
    ]
    
    # Test basic patterns
    assert provider._evaluate_basic_pattern("ToolCallComplete", events) == True
    assert provider._evaluate_basic_pattern("AgentExecutionStart", events) == True
    assert provider._evaluate_basic_pattern("ResolveComplete", events) == True
    
    # Test CEL patterns
    assert provider._evaluate_basic_pattern("events.exists(e, e.reason == 'ToolCallComplete')", events) == True
    assert provider._evaluate_basic_pattern("events.size() >= 3", events) == True
    assert provider._evaluate_basic_pattern("events.size() > 0", events) == True


def test_migration_patterns():
    """Test that migration patterns are available"""
    from evaluator.helpers.integration_guide import MIGRATION_PATTERNS
    
    cel_to_semantic = MIGRATION_PATTERNS["cel_to_semantic"]
    
    # Test key migrations exist
    expected_patterns = [
        "events.exists(e, e.reason == 'ToolCallComplete')",
        "events.filter(e, e.reason == 'ToolCallComplete').size()",
        "events.exists(e, e.reason == 'AgentExecutionComplete')",
        "events.exists(e, e.reason == 'ResolveComplete')"
    ]
    
    for pattern in expected_patterns:
        assert pattern in cel_to_semantic, f"Missing migration for: {pattern}"
        
        # Verify migration target is semantic
        migration = cel_to_semantic[pattern] 
        assert any(helper in migration for helper in ["tool.", "agent.", "query."]), f"Migration should be semantic: {migration}"


def test_helper_classes_implemented():
    """Test that all helper classes are properly implemented"""
    from evaluator.helpers.event_analyzer import EventAnalyzer
    from evaluator.helpers.tool_helper import ToolHelper
    from evaluator.helpers.agent_helper import AgentHelper
    from evaluator.helpers.team_helper import TeamHelper
    from evaluator.helpers.sequence_helper import SequenceHelper
    from evaluator.helpers.query_helper import QueryHelper
    
    analyzer = EventAnalyzer("test", "test", "test")
    
    # Test that all helpers can be instantiated
    helpers = [
        ToolHelper(analyzer),
        AgentHelper(analyzer),
        TeamHelper(analyzer),
        SequenceHelper(analyzer),
        QueryHelper(analyzer)
    ]
    
    for helper in helpers:
        assert helper is not None
        assert helper.event_analyzer is analyzer


def test_provider_type():
    """Test that provider returns correct evaluation type"""
    provider = EventEvaluationProvider()
    assert provider.get_evaluation_type() == "event"


if __name__ == "__main__":
    test_semantic_expressions_implementation()
    test_helper_initialization()
    test_evaluation_request_creation()
    test_basic_pattern_evaluation()
    test_migration_patterns()
    test_all_manifests_exist()
    test_provider_type()
    print("✅ All final validation tests passed!")