"""Test suite for QueryResolver"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from kubernetes import client, config
from ark_sdk.models import QueryV1alpha1, QueryV1alpha1Status, EvaluationV1alpha1StatusTokenUsage

from evaluator.metrics.query_resolver import QueryResolver
from evaluator.types import QueryRef


class TestQueryResolver:
    """Test the QueryResolver class"""
    
    @pytest.fixture
    def mock_k8s_config(self):
        """Mock Kubernetes configuration loading"""
        with patch('evaluator.metrics.query_resolver.config') as mock_config:
            # Ensure ConfigException is accessible on the mock
            mock_config.ConfigException = config.ConfigException
            mock_config.load_incluster_config.side_effect = config.ConfigException("Not in cluster")
            mock_config.load_kube_config.return_value = None
            yield mock_config
    
    @pytest.fixture
    def mock_k8s_client(self):
        """Mock Kubernetes ApiClient"""
        with patch('evaluator.metrics.query_resolver.client.ApiClient') as mock_client_class:
            mock_client = Mock()
            mock_client_class.return_value = mock_client
            yield mock_client
    
    @pytest.fixture
    def query_resolver(self, mock_k8s_config, mock_k8s_client):
        """Create QueryResolver with mocked dependencies"""
        return QueryResolver()
    
    @pytest.fixture
    def sample_query_ref(self):
        """Sample QueryRef for testing"""
        return QueryRef(name="test-query", namespace="default")
    
    @pytest.fixture
    def sample_query_crd(self):
        """Sample Query CRD data"""
        return {
            "apiVersion": "ark.mckinsey.com/v1alpha1",
            "kind": "Query",
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "spec": {
                "input": "What is 2+2?",
                "targets": [{"type": "agent", "name": "math-agent"}]
            },
            "status": {
                "phase": "done",
                "tokenUsage": {
                    "totalTokens": 150,
                    "promptTokens": 50,
                    "completionTokens": 100
                },
                "responses": [
                    {
                        "target": {"type": "agent", "name": "math-agent"},
                        "content": "2+2 equals 4"
                    }
                ]
            }
        }
    
    @pytest.mark.asyncio
    async def test_resolve_query_success(self, query_resolver, sample_query_ref, sample_query_crd):
        """Test successful query resolution"""
        # Mock the custom objects API
        mock_custom_api = Mock()
        mock_custom_api.get_namespaced_custom_object.return_value = sample_query_crd
        
        with patch('evaluator.metrics.query_resolver.client.CustomObjectsApi') as mock_api_class:
            mock_api_class.return_value = mock_custom_api
            
            result = await query_resolver.resolve_query(sample_query_ref)
            
            # The resolver now returns the dict directly, not a QueryV1alpha1 object
            assert result == sample_query_crd
            mock_custom_api.get_namespaced_custom_object.assert_called_once_with(
                group="ark.mckinsey.com",
                version="v1alpha1",
                namespace="default",
                plural="queries",
                name="test-query"
            )
    
    @pytest.mark.asyncio
    async def test_resolve_query_not_found(self, query_resolver, sample_query_ref):
        """Test query resolution when query not found"""
        mock_custom_api = Mock()
        api_exception = client.rest.ApiException(status=404, reason="Not Found")
        mock_custom_api.get_namespaced_custom_object.side_effect = api_exception
        
        with patch('evaluator.metrics.query_resolver.client.CustomObjectsApi') as mock_api_class:
            mock_api_class.return_value = mock_custom_api
            
            with pytest.raises(ValueError, match="Query 'test-query' not found in namespace 'default'"):
                await query_resolver.resolve_query(sample_query_ref)
    
    @pytest.mark.asyncio
    async def test_resolve_query_access_denied(self, query_resolver, sample_query_ref):
        """Test query resolution when access is denied"""
        mock_custom_api = Mock()
        api_exception = client.rest.ApiException(status=403, reason="Forbidden")
        mock_custom_api.get_namespaced_custom_object.side_effect = api_exception
        
        with patch('evaluator.metrics.query_resolver.client.CustomObjectsApi') as mock_api_class:
            mock_api_class.return_value = mock_custom_api
            
            with pytest.raises(ValueError, match="Access denied to query 'test-query'"):
                await query_resolver.resolve_query(sample_query_ref)
    
    def test_extract_metrics_from_query_complete(self, query_resolver):
        """Test metrics extraction from complete query"""
        # Use dict format since the actual implementation works with dicts
        mock_query = {
            'metadata': {
                'name': 'test-query',
                'namespace': 'default',
                'labels': {'type': 'test', 'priority': 'high'}
            },
            'status': {
                'tokenUsage': {
                    'totalTokens': 200,
                    'promptTokens': 60,
                    'completionTokens': 140
                },
                'response': {
                    'content': 'This is a test response with some content'
                }
            }
        }
        
        result = query_resolver.extract_metrics_from_query(mock_query)
        
        # Check token metrics
        assert result["totalTokens"] == 200
        assert result["promptTokens"] == 60
        assert result["completionTokens"] == 140
        assert result["tokenEfficiency"] == 140 / 60  # completion / prompt
        
        # Check response metrics
        assert result["responseCount"] == 1
        assert result["totalResponseLength"] == len("This is a test response with some content")
        assert result["averageResponseLength"] == len("This is a test response with some content")
        
        # Check metadata
        assert result["queryName"] == "test-query"
        assert result["queryNamespace"] == "default"
        assert result["labels"] == {"type": "test", "priority": "high"}
    
    def test_extract_metrics_from_query_no_status(self, query_resolver):
        """Test metrics extraction from query without status"""
        # Use dict format since the actual implementation works with dicts
        mock_query = {
            'metadata': {
                'name': 'test-query',
                'namespace': 'default'
            }
        }
        
        result = query_resolver.extract_metrics_from_query(mock_query)
        
        # Should return basic metadata even without status
        assert result["queryName"] == "test-query"
        assert result["queryNamespace"] == "default"
        assert "totalTokens" not in result
    
    def test_extract_metrics_from_query_zero_prompt_tokens(self, query_resolver):
        """Test token efficiency calculation with zero prompt tokens"""
        # Use dict format since the actual implementation works with dicts
        mock_query = {
            'metadata': {
                'name': 'test-query',
                'namespace': 'default'
            },
            'status': {
                'tokenUsage': {
                    'totalTokens': 100,
                    'promptTokens': 0,
                    'completionTokens': 100
                }
            }
        }
        
        result = query_resolver.extract_metrics_from_query(mock_query)
        
        assert result["tokenEfficiency"] == 0
        assert result["totalTokens"] == 100
    
    def test_load_query_crd_success(self, query_resolver, sample_query_crd):
        """Test successful CRD loading"""
        mock_custom_api = Mock()
        mock_custom_api.get_namespaced_custom_object.return_value = sample_query_crd
        
        with patch('evaluator.metrics.query_resolver.client.CustomObjectsApi') as mock_api_class:
            mock_api_class.return_value = mock_custom_api
            
            result = query_resolver._load_query_crd("test-query", "default")
            
            assert result == sample_query_crd
            mock_custom_api.get_namespaced_custom_object.assert_called_once_with(
                group="ark.mckinsey.com",
                version="v1alpha1",
                namespace="default",
                plural="queries",
                name="test-query"
            )
    
    def test_parse_duration_string_simple_seconds(self, query_resolver):
        """Test parsing simple seconds format"""
        assert query_resolver._parse_duration_string("1.581370292s") == 1.581370292
        assert query_resolver._parse_duration_string("5s") == 5.0
        assert query_resolver._parse_duration_string("0.5s") == 0.5
        assert query_resolver._parse_duration_string("10") == 10.0  # No unit, assume seconds
    
    def test_parse_duration_string_complex_format(self, query_resolver):
        """Test parsing complex duration formats"""
        assert query_resolver._parse_duration_string("1h") == 3600.0
        assert query_resolver._parse_duration_string("2m") == 120.0
        assert query_resolver._parse_duration_string("1h30m") == 5400.0  # 3600 + 1800
        assert query_resolver._parse_duration_string("1h5m30s") == 3930.0  # 3600 + 300 + 30
        assert query_resolver._parse_duration_string("2m30s") == 150.0  # 120 + 30
    
    def test_parse_duration_string_invalid(self, query_resolver):
        """Test parsing invalid duration strings"""
        with pytest.raises(ValueError, match="Unable to parse duration string"):
            query_resolver._parse_duration_string("invalid")
    
    def test_extract_timing_metrics_with_duration_field(self, query_resolver):
        """Test timing metrics extraction using status.duration field"""
        mock_status = Mock()
        mock_status.duration = "1.581370292s"
        
        metrics = {"totalTokens": 100}
        query_resolver._extract_timing_metrics(mock_status, metrics)
        
        assert metrics["executionDuration"] == "1.58s"
        assert metrics["executionDurationSeconds"] == 1.581370292
        assert metrics["tokensPerSecond"] == 100 / 1.581370292
        assert "evaluationTimestamp" in metrics
    
    def test_extract_timing_metrics_with_timestamps_fallback(self, query_resolver):
        """Test timing metrics extraction falling back to timestamps"""
        from datetime import datetime
        
        mock_status = Mock()
        mock_status.duration = None  # No duration field
        mock_status.started_at = "2024-01-01T10:00:00Z"
        mock_status.completed_at = "2024-01-01T10:00:02Z"
        
        metrics = {"totalTokens": 200}
        query_resolver._extract_timing_metrics(mock_status, metrics)
        
        assert metrics["executionDuration"] == "2.00s"
        assert metrics["executionDurationSeconds"] == 2.0
        assert metrics["tokensPerSecond"] == 100.0  # 200 tokens / 2 seconds
    
    def test_extract_timing_metrics_no_duration_info(self, query_resolver):
        """Test timing metrics extraction with no duration information"""
        mock_status = Mock()
        mock_status.duration = None
        mock_status.started_at = None
        mock_status.completed_at = None
        
        metrics = {}
        query_resolver._extract_timing_metrics(mock_status, metrics)
        
        assert "executionDuration" not in metrics
        assert "executionDurationSeconds" not in metrics
        assert "tokensPerSecond" not in metrics
        assert "evaluationTimestamp" in metrics
    
    def test_extract_timing_metrics_duration_object(self, query_resolver):
        """Test timing metrics extraction with duration object"""
        mock_duration = Mock()
        mock_duration.seconds = 2
        mock_duration.microseconds = 500000  # 0.5 seconds
        
        mock_status = Mock()
        mock_status.duration = mock_duration
        
        metrics = {"totalTokens": 150}
        query_resolver._extract_timing_metrics(mock_status, metrics)
        
        assert metrics["executionDuration"] == "2.50s"
        assert metrics["executionDurationSeconds"] == 2.5
        assert metrics["tokensPerSecond"] == 60.0  # 150 tokens / 2.5 seconds