"""Test suite for ARK SDK integration"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from ark_sdk.models import QueryV1alpha1, QueryV1alpha1Status, EvaluationV1alpha1StatusTokenUsage

from src.evaluator.metrics.ark_client import ArkClient
from src.evaluator.metrics.metric_types import QueryRef


class TestArkClient:
    """Test the ArkClient class"""
    
    @pytest.fixture
    def mock_query_resolver(self):
        """Mock QueryResolver"""
        with patch('src.evaluator.metrics.ark_client.QueryResolver') as mock_resolver_class:
            mock_resolver = Mock()
            mock_resolver_class.return_value = mock_resolver
            yield mock_resolver
    
    @pytest.fixture
    def ark_client(self, mock_query_resolver):
        """Create ArkClient with mocked dependencies"""
        return ArkClient()
    
    @pytest.fixture
    def sample_query_ref(self):
        """Sample QueryRef for testing"""
        return QueryRef(name="test-query", namespace="default")
    
    @pytest.fixture
    def sample_query_config(self):
        """Sample QueryV1alpha1 for testing"""
        # Create a mock QueryV1alpha1 object
        query = Mock(spec=QueryV1alpha1)
        query.metadata = Mock()
        query.metadata.name = "test-query"
        query.metadata.namespace = "default"
        
        # Add status with token usage
        query.status = Mock(spec=QueryV1alpha1Status)
        query.status.token_usage = Mock(spec=EvaluationV1alpha1StatusTokenUsage)
        query.status.token_usage.total_tokens = 1000
        query.status.token_usage.prompt_tokens = 100
        query.status.token_usage.completion_tokens = 900
        
        return query
    
    @pytest.mark.asyncio
    async def test_load_query_success(self, ark_client, mock_query_resolver, sample_query_ref, sample_query_config):
        """Test successful query loading"""
        # Mock the resolver to return a query config
        mock_query_resolver.resolve_query = AsyncMock(return_value=sample_query_config)
        
        result = await ark_client.load_query(sample_query_ref)
        
        assert result == sample_query_config
        mock_query_resolver.resolve_query.assert_called_once_with(sample_query_ref)
    
    @pytest.mark.asyncio
    async def test_load_query_failure(self, ark_client, mock_query_resolver, sample_query_ref):
        """Test query loading failure"""
        # Mock the resolver to raise an exception
        mock_query_resolver.resolve_query = AsyncMock(side_effect=ValueError("Query not found"))
        
        with pytest.raises(ValueError, match="Query not found"):
            await ark_client.load_query(sample_query_ref)
    
    @pytest.mark.asyncio
    async def test_extract_metrics_success(self, ark_client, mock_query_resolver, sample_query_config):
        """Test successful metrics extraction"""
        # Mock the resolver to return metrics
        expected_metrics = {
            "totalTokens": 1000,
            "promptTokens": 100,
            "completionTokens": 900,
            "tokenEfficiency": 9.0
        }
        mock_query_resolver.extract_metrics_from_query.return_value = expected_metrics
        
        result = await ark_client.extract_metrics(sample_query_config)
        
        # Check that base metrics are present
        assert result["totalTokens"] == 1000
        assert result["promptTokens"] == 100
        assert result["completionTokens"] == 900
        assert result["tokenEfficiency"] == 9.0
        
        # Check that derived metrics were added
        assert "evaluationTimestamp" in result
        assert "threshold_violations" in result
        assert "passed_thresholds" in result
        assert "estimatedCost" in result
        
        # Check estimated cost calculation
        expected_cost = 1000 * 0.00002  # 1000 tokens * 0.00002
        assert result["estimatedCost"] == expected_cost
        
        mock_query_resolver.extract_metrics_from_query.assert_called_once_with(sample_query_config)
    
    @pytest.mark.asyncio
    async def test_extract_metrics_failure(self, ark_client, mock_query_resolver, sample_query_config):
        """Test metrics extraction failure"""
        # Mock the resolver to raise an exception
        mock_query_resolver.extract_metrics_from_query.side_effect = Exception("Extraction failed")
        
        with pytest.raises(Exception, match="Extraction failed"):
            await ark_client.extract_metrics(sample_query_config)
    
    def test_add_derived_metrics(self, ark_client):
        """Test derived metrics calculation"""
        base_metrics = {
            "totalTokens": 500,
            "promptTokens": 50,
            "completionTokens": 450
        }
        
        ark_client._add_derived_metrics(base_metrics)
        
        # Check that derived metrics were added
        assert "evaluationTimestamp" in base_metrics
        assert "threshold_violations" in base_metrics
        assert "passed_thresholds" in base_metrics
        assert "estimatedCost" in base_metrics
        
        # Check that lists are initialized as empty
        assert base_metrics["threshold_violations"] == []
        assert base_metrics["passed_thresholds"] == []
        
        # Check cost calculation
        expected_cost = 500 * 0.00002
        assert base_metrics["estimatedCost"] == expected_cost
    
    def test_add_derived_metrics_without_tokens(self, ark_client):
        """Test derived metrics when no token data available"""
        base_metrics = {
            "responseLength": 100
        }
        
        ark_client._add_derived_metrics(base_metrics)
        
        # Check that basic derived metrics were added
        assert "evaluationTimestamp" in base_metrics
        assert "threshold_violations" in base_metrics
        assert "passed_thresholds" in base_metrics
        
        # Check that cost is not added when no tokens
        assert "estimatedCost" not in base_metrics