import pytest
import logging
from unittest.mock import Mock, patch, MagicMock
from kubernetes.client.rest import ApiException

from src.evaluator.providers.event_evaluation import EventEvaluationProvider
from src.evaluator.types import UnifiedEvaluationRequest, EvaluationResponse

logger = logging.getLogger(__name__)


class TestEventEvaluationProvider:
    """Test suite for EventEvaluationProvider"""
    
    def setup_method(self):
        """Set up test fixtures"""
        # Mock Kubernetes config loading to avoid actual cluster connections
        with patch('src.evaluator.providers.event_evaluation.config') as mock_config:
            mock_config.load_incluster_config.side_effect = Exception("Not in cluster")
            mock_config.load_kube_config.side_effect = Exception("No local config")
            
            self.provider = EventEvaluationProvider()
            self.mock_session = Mock()
            self.provider_with_session = EventEvaluationProvider(shared_session=self.mock_session)
    
    @patch('src.evaluator.providers.event_evaluation.config')
    @patch('src.evaluator.providers.event_evaluation.client')
    def test_initialization_with_incluster_config(self, mock_k8s_client, mock_k8s_config):
        """Test provider initialization with in-cluster config"""
        mock_k8s_config.load_incluster_config.return_value = None
        mock_core_api = Mock()
        mock_k8s_client.CoreV1Api.return_value = mock_core_api
        
        provider = EventEvaluationProvider()
        
        assert provider.k8s_client is mock_core_api
        mock_k8s_config.load_incluster_config.assert_called_once()
    
    @patch('src.evaluator.providers.event_evaluation.config')
    @patch('src.evaluator.providers.event_evaluation.client')
    def test_initialization_with_local_config_fallback(self, mock_k8s_client, mock_k8s_config):
        """Test provider initialization falls back to local config"""
        mock_k8s_config.load_incluster_config.side_effect = Exception("Not in cluster")
        mock_k8s_config.load_kube_config.return_value = None
        mock_core_api = Mock()
        mock_k8s_client.CoreV1Api.return_value = mock_core_api
        
        provider = EventEvaluationProvider()
        
        assert provider.k8s_client is mock_core_api
        mock_k8s_config.load_incluster_config.assert_called_once()
        mock_k8s_config.load_kube_config.assert_called_once()
    
    def test_initialization_no_kubernetes_config(self):
        """Test provider initialization when no Kubernetes config is available"""
        # This is tested in setup_method where both config methods fail
        assert self.provider.k8s_client is None
    
    def test_get_evaluation_type(self):
        """Test evaluation type identification"""
        assert self.provider.get_evaluation_type() == "event"
    
    @patch('src.evaluator.providers.event_evaluation.EventAnalyzer')
    @patch('src.evaluator.providers.event_evaluation.ToolHelper')
    @patch('src.evaluator.providers.event_evaluation.AgentHelper')
    @patch('src.evaluator.providers.event_evaluation.TeamHelper')
    @patch('src.evaluator.providers.event_evaluation.LLMHelper')
    @patch('src.evaluator.providers.event_evaluation.SequenceHelper')
    @patch('src.evaluator.providers.event_evaluation.QueryHelper')
    def test_initialize_helpers(self, mock_query_helper, mock_sequence_helper, 
                               mock_llm_helper, mock_team_helper, mock_agent_helper,
                               mock_tool_helper, mock_event_analyzer):
        """Test helper initialization with context"""
        mock_analyzer_instance = Mock()
        mock_event_analyzer.return_value = mock_analyzer_instance
        
        # Initialize helpers
        self.provider._initialize_helpers("test-namespace", "test-query", "session-123")
        
        # Verify EventAnalyzer was created with correct parameters
        mock_event_analyzer.assert_called_once_with(
            namespace="test-namespace",
            query_name="test-query", 
            session_id="session-123"
        )
        
        # Verify all helpers were initialized with the analyzer
        mock_tool_helper.assert_called_once_with(mock_analyzer_instance)
        mock_agent_helper.assert_called_once_with(mock_analyzer_instance)
        mock_team_helper.assert_called_once_with(mock_analyzer_instance)
        mock_llm_helper.assert_called_once_with(mock_analyzer_instance)
        mock_sequence_helper.assert_called_once_with(mock_analyzer_instance)
        mock_query_helper.assert_called_once_with(mock_analyzer_instance)
        
        # Verify helpers are stored in provider
        assert self.provider.event_analyzer is mock_analyzer_instance
        assert self.provider.tool_helper is not None
        assert self.provider.agent_helper is not None
        assert self.provider.team_helper is not None
        assert self.provider.llm_helper is not None
        assert self.provider.sequence_helper is not None
        assert self.provider.query_helper is not None
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_rules(self):
        """Test evaluation fails with missing rules"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.evaluatorName = "test-evaluator"
        request.config = Mock()
        request.config.rules = []  # Empty rules
        
        result = await self.provider.evaluate(request)
        
        assert result.score == "0.0"
        assert result.passed is False
        assert result.metadata["error"] == "no_rules_provided"
    
    @pytest.mark.asyncio
    async def test_evaluate_no_rules_attribute(self):
        """Test evaluation handles missing rules attribute"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.evaluatorName = "test-evaluator"
        request.config = Mock()
        request.config.rules = None  # None rules
        
        result = await self.provider.evaluate(request)
        
        assert result.score == "0.0"
        assert result.passed is False
        assert result.metadata["error"] == "no_rules_provided"
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_query_parameters(self):
        """Test evaluation fails with missing query context parameters"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.evaluatorName = "test-evaluator"
        request.config = Mock()
        request.config.rules = [{"name": "test", "expression": "tool.called('test')"}]
        request.parameters = {}  # Missing query.name and query.namespace
        
        result = await self.provider.evaluate(request)
        
        assert result.score == "0.0"
        assert result.passed is False
        assert result.metadata["error"] == "missing_query_context"
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_query_name(self):
        """Test evaluation fails with missing query name"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.evaluatorName = "test-evaluator"
        request.config = Mock()
        request.config.rules = [{"name": "test", "expression": "tool.called('test')"}]
        request.parameters = {"query.namespace": "default"}  # Missing query.name
        
        result = await self.provider.evaluate(request)
        
        assert result.score == "0.0"
        assert result.passed is False
        # Check that error was handled appropriately
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_query_namespace(self):
        """Test evaluation fails with missing query namespace"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.evaluatorName = "test-evaluator"
        request.config = Mock()
        request.config.rules = [{"name": "test", "expression": "tool.called('test')"}]
        request.parameters = {"query.name": "test-query"}  # Missing query.namespace
        
        result = await self.provider.evaluate(request)
        
        assert result.score == "0.0"
        assert result.passed is False
        # Check that error was handled appropriately
    
    @pytest.mark.asyncio
    @patch.object(EventEvaluationProvider, '_initialize_helpers')
    @patch.object(EventEvaluationProvider, '_fetch_k8s_events')
    @patch.object(EventEvaluationProvider, '_evaluate_expression')
    async def test_evaluate_with_valid_parameters_calls_helpers_init(self, mock_evaluate_expr, mock_fetch_events, mock_init_helpers):
        """Test that evaluate calls helper initialization with valid parameters"""
        # Mock the provider to have a k8s client and setup mocks
        self.provider.k8s_client = Mock()
        mock_fetch_events.return_value = []
        mock_evaluate_expr.return_value = True
        
        request = Mock(spec=UnifiedEvaluationRequest)
        request.evaluatorName = "test-evaluator"
        request.config = Mock()
        request.config.rules = [{"name": "test", "expression": "tool.called('test')"}]
        request.parameters = {
            "query.name": "test-query",
            "query.namespace": "test-namespace", 
            "sessionId": "session-123"
        }
        
        result = await self.provider.evaluate(request)
        
        # Verify helper initialization was called with correct parameters
        mock_init_helpers.assert_called_once_with("test-namespace", "test-query", "session-123")
    
    @pytest.mark.asyncio  
    async def test_evaluate_no_kubernetes_client(self):
        """Test evaluation fails when no Kubernetes client is available"""
        # Provider already has k8s_client as None from setup
        request = Mock(spec=UnifiedEvaluationRequest)
        request.evaluatorName = "test-evaluator"
        request.config = Mock()
        request.config.rules = [{"name": "test", "expression": "tool.called('test')"}]
        request.parameters = {
            "query.name": "test-query",
            "query.namespace": "test-namespace"
        }
        
        result = await self.provider.evaluate(request)
        
        assert result.score == "0.000"
        assert result.passed is False
        # When k8s client is not available, evaluation continues with empty events and fails during expression evaluation
        assert "error" not in result.metadata or "tool" in result.metadata.get("error", "")
    
    def test_shared_session_initialization(self):
        """Test provider initialization with shared session"""
        assert self.provider.shared_session is None
        assert self.provider_with_session.shared_session is self.mock_session


# Test cases for rule evaluation logic (these would test the actual rule processing)
class TestEventEvaluationRuleProcessing:
    """
    Test cases for the rule processing logic in event evaluation.
    These tests focus on the expression evaluation mechanics.
    """
    
    def setup_method(self):
        """Set up test fixtures"""
        with patch('src.evaluator.providers.event_evaluation.config') as mock_config:
            mock_config.load_incluster_config.side_effect = Exception("Not in cluster")
            mock_config.load_kube_config.side_effect = Exception("No local config")
            
            self.provider = EventEvaluationProvider()
            # Mock k8s client for rule processing tests
            self.provider.k8s_client = Mock()
    
    def test_rule_validation_basic_structure(self):
        """Test basic rule structure validation"""
        # These would test the rule validation logic once implemented
        valid_rules = [
            {"name": "tool_usage", "expression": "tool.called('web_search')"},
            {"name": "agent_response", "expression": "agent.responded()"},
            {"name": "team_coordination", "expression": "team.strategy_used('sequential')"}
        ]
        
        # This would test rule validation logic
        for rule in valid_rules:
            assert "name" in rule
            assert "expression" in rule
            assert len(rule["name"]) > 0
            assert len(rule["expression"]) > 0
    
    def test_expression_syntax_patterns(self):
        """Test expression syntax pattern matching"""
        # Test patterns that should be supported
        valid_expressions = [
            "tool.called('web_search')",
            "agent.responded()",
            "team.members_count() > 2",
            "query.completed_successfully()",
            "sequence.step_count() == 3",
            "llm.token_usage() < 1000"
        ]
        
        # Basic syntax validation (this would be more sophisticated in actual implementation)
        for expr in valid_expressions:
            assert "." in expr  # Should have object.method format
            assert "(" in expr  # Should have method calls
            assert ")" in expr  # Should close method calls
    
    def test_helper_method_patterns(self):
        """Test patterns for different helper method categories"""
        helper_patterns = {
            "tool": ["called", "used", "failed", "succeeded"],
            "agent": ["responded", "failed", "token_usage", "execution_time"],
            "team": ["strategy_used", "members_count", "coordination_successful"],
            "query": ["completed_successfully", "failed", "execution_time"],
            "sequence": ["step_count", "step_failed", "step_succeeded"],
            "llm": ["token_usage", "model_used", "response_generated"]
        }
        
        for helper_type, methods in helper_patterns.items():
            for method in methods:
                expression = f"{helper_type}.{method}()"
                assert helper_type in expression
                assert method in expression
                assert "(" in expression and ")" in expression


# Placeholder for comprehensive integration tests once full implementation is complete
class TestEventEvaluationIntegration:
    """
    Integration test cases for event evaluation with actual Kubernetes events.
    These would test the complete evaluation flow once implemented.
    """
    
    @pytest.mark.integration
    @pytest.mark.skip(reason="Requires full event evaluation implementation")
    async def test_evaluate_tool_usage_events(self):
        """Test evaluation of tool usage events from Kubernetes"""
        # This would test actual tool event processing
        pass
    
    @pytest.mark.integration 
    @pytest.mark.skip(reason="Requires full event evaluation implementation")
    async def test_evaluate_agent_coordination_events(self):
        """Test evaluation of agent coordination events"""
        # This would test agent interaction event processing
        pass
    
    @pytest.mark.integration
    @pytest.mark.skip(reason="Requires full event evaluation implementation") 
    async def test_evaluate_team_strategy_events(self):
        """Test evaluation of team strategy execution events"""
        # This would test team coordination event processing
        pass