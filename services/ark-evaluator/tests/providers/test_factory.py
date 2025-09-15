import pytest
import logging
from unittest.mock import Mock

from src.evaluator.providers.factory import EvaluationProviderFactory
from src.evaluator.providers.base import EvaluationProvider
from src.evaluator.providers.direct_evaluation import DirectEvaluationProvider
from src.evaluator.providers.query_evaluation import QueryEvaluationProvider
from src.evaluator.providers.baseline_evaluation import BaselineEvaluationProvider
from src.evaluator.providers.batch_evaluation import BatchEvaluationProvider
from src.evaluator.providers.event_evaluation import EventEvaluationProvider
from src.evaluator.types import EvaluationType

logger = logging.getLogger(__name__)


class MockEvaluationProvider(EvaluationProvider):
    """Mock provider for testing factory registration"""
    
    def __init__(self, shared_session=None):
        super().__init__(shared_session)
        
    async def evaluate(self, request):
        return Mock()
    
    def get_evaluation_type(self) -> str:
        return "mock"


class TestEvaluationProviderFactory:
    """Test suite for EvaluationProviderFactory"""
    
    def setup_method(self):
        """Set up test fixtures"""
        # Clear any existing registrations to ensure clean state
        EvaluationProviderFactory._providers = {}
    
    def teardown_method(self):
        """Clean up after tests"""
        # Clear registrations after each test
        EvaluationProviderFactory._providers = {}
    
    def test_register_provider(self):
        """Test provider registration"""
        EvaluationProviderFactory.register("test", MockEvaluationProvider)
        
        assert "test" in EvaluationProviderFactory._providers
        assert EvaluationProviderFactory._providers["test"] is MockEvaluationProvider
    
    def test_register_multiple_providers(self):
        """Test registration of multiple providers"""
        class MockProvider1(MockEvaluationProvider):
            def get_evaluation_type(self):
                return "mock1"
        
        class MockProvider2(MockEvaluationProvider):
            def get_evaluation_type(self):
                return "mock2"
        
        EvaluationProviderFactory.register("type1", MockProvider1)
        EvaluationProviderFactory.register("type2", MockProvider2)
        
        assert len(EvaluationProviderFactory._providers) == 2
        assert EvaluationProviderFactory._providers["type1"] is MockProvider1
        assert EvaluationProviderFactory._providers["type2"] is MockProvider2
    
    def test_create_provider_with_enum_type(self):
        """Test creating provider with EvaluationType enum"""
        EvaluationProviderFactory.register("direct", MockEvaluationProvider)
        
        provider = EvaluationProviderFactory.create(EvaluationType.DIRECT)
        
        assert isinstance(provider, MockEvaluationProvider)
        assert provider.shared_session is None
    
    def test_create_provider_with_string_type(self):
        """Test creating provider with string type"""
        EvaluationProviderFactory.register("direct", MockEvaluationProvider)
        
        provider = EvaluationProviderFactory.create("direct")
        
        assert isinstance(provider, MockEvaluationProvider)
        assert provider.shared_session is None
    
    def test_create_provider_with_shared_session(self):
        """Test creating provider with shared session"""
        EvaluationProviderFactory.register("direct", MockEvaluationProvider)
        mock_session = Mock()
        
        provider = EvaluationProviderFactory.create("direct", shared_session=mock_session)
        
        assert isinstance(provider, MockEvaluationProvider)
        assert provider.shared_session is mock_session
    
    def test_create_unregistered_provider(self):
        """Test creating provider for unregistered type"""
        with pytest.raises(ValueError) as exc_info:
            EvaluationProviderFactory.create("nonexistent")
        
        error_msg = str(exc_info.value)
        assert "No provider registered for evaluation type 'nonexistent'" in error_msg
        assert "Available types: []" in error_msg
    
    def test_create_unregistered_provider_with_available_types(self):
        """Test error message includes available types when creating unregistered provider"""
        EvaluationProviderFactory.register("direct", MockEvaluationProvider)
        EvaluationProviderFactory.register("query", MockEvaluationProvider)
        
        with pytest.raises(ValueError) as exc_info:
            EvaluationProviderFactory.create("nonexistent")
        
        error_msg = str(exc_info.value)
        assert "No provider registered for evaluation type 'nonexistent'" in error_msg
        assert "Available types:" in error_msg
        assert "direct" in error_msg
        assert "query" in error_msg
    
    def test_get_registered_types_empty(self):
        """Test getting registered types when none are registered"""
        types = EvaluationProviderFactory.get_registered_types()
        assert types == []
    
    def test_get_registered_types_populated(self):
        """Test getting registered types when some are registered"""
        EvaluationProviderFactory.register("direct", MockEvaluationProvider)
        EvaluationProviderFactory.register("query", MockEvaluationProvider)
        EvaluationProviderFactory.register("baseline", MockEvaluationProvider)
        
        types = EvaluationProviderFactory.get_registered_types()
        
        assert len(types) == 3
        assert "direct" in types
        assert "query" in types
        assert "baseline" in types
    
    def test_provider_replacement(self):
        """Test replacing an existing provider registration"""
        class OriginalProvider(MockEvaluationProvider):
            pass
        
        class ReplacementProvider(MockEvaluationProvider):
            pass
        
        # Register original
        EvaluationProviderFactory.register("test", OriginalProvider)
        assert EvaluationProviderFactory._providers["test"] is OriginalProvider
        
        # Replace with new provider
        EvaluationProviderFactory.register("test", ReplacementProvider)
        assert EvaluationProviderFactory._providers["test"] is ReplacementProvider
        
        # Verify factory creates the replacement provider
        provider = EvaluationProviderFactory.create("test")
        assert isinstance(provider, ReplacementProvider)
    
    def test_all_standard_provider_types(self):
        """Test that all standard evaluation types can be registered"""
        # Register all standard providers
        EvaluationProviderFactory.register("direct", DirectEvaluationProvider)
        EvaluationProviderFactory.register("query", QueryEvaluationProvider)
        EvaluationProviderFactory.register("baseline", BaselineEvaluationProvider)
        EvaluationProviderFactory.register("batch", BatchEvaluationProvider)
        EvaluationProviderFactory.register("event", EventEvaluationProvider)
        
        # Test creating each type
        for eval_type in ["direct", "query", "baseline", "batch", "event"]:
            provider = EvaluationProviderFactory.create(eval_type)
            assert provider is not None
            assert provider.get_evaluation_type() == eval_type
    
    def test_factory_state_isolation(self):
        """Test that factory state is properly isolated between tests"""
        # This test verifies that setup_method/teardown_method work correctly
        
        # Should start with empty registry due to setup_method
        assert len(EvaluationProviderFactory._providers) == 0
        
        # Register a provider
        EvaluationProviderFactory.register("isolation_test", MockEvaluationProvider)
        assert len(EvaluationProviderFactory._providers) == 1
        
        # teardown_method should clean this up for the next test


class TestEvaluationProviderFactoryIntegration:
    """Integration tests for the provider factory with real provider instances"""
    
    def setup_method(self):
        """Set up test fixtures"""
        EvaluationProviderFactory._providers = {}
        
        # Register all standard providers
        EvaluationProviderFactory.register("direct", DirectEvaluationProvider)
        EvaluationProviderFactory.register("query", QueryEvaluationProvider) 
        EvaluationProviderFactory.register("baseline", BaselineEvaluationProvider)
        EvaluationProviderFactory.register("batch", BatchEvaluationProvider)
        EvaluationProviderFactory.register("event", EventEvaluationProvider)
    
    def teardown_method(self):
        """Clean up after tests"""
        EvaluationProviderFactory._providers = {}
    
    def test_create_all_provider_types(self):
        """Test creating instances of all provider types"""
        provider_expectations = {
            "direct": DirectEvaluationProvider,
            "query": QueryEvaluationProvider,
            "baseline": BaselineEvaluationProvider,
            "batch": BatchEvaluationProvider,
            "event": EventEvaluationProvider
        }
        
        for eval_type, expected_class in provider_expectations.items():
            provider = EvaluationProviderFactory.create(eval_type)
            
            assert isinstance(provider, expected_class)
            assert provider.get_evaluation_type() == eval_type
            assert provider.shared_session is None
    
    def test_create_with_shared_session_all_types(self):
        """Test creating all provider types with shared session"""
        mock_session = Mock()
        
        for eval_type in ["direct", "query", "baseline", "batch", "event"]:
            provider = EvaluationProviderFactory.create(eval_type, shared_session=mock_session)
            
            assert provider.shared_session is mock_session
    
    def test_enum_type_compatibility(self):
        """Test compatibility with EvaluationType enum values"""
        enum_to_string = {
            EvaluationType.DIRECT: "direct",
            EvaluationType.QUERY: "query", 
            EvaluationType.BASELINE: "baseline",
            EvaluationType.BATCH: "batch",
            EvaluationType.EVENT: "event"
        }
        
        for enum_type, expected_string in enum_to_string.items():
            provider = EvaluationProviderFactory.create(enum_type)
            assert provider.get_evaluation_type() == expected_string
    
    def test_factory_comprehensive_workflow(self):
        """Test complete workflow from registration to provider creation and usage"""
        # Verify initial state
        registered_types = EvaluationProviderFactory.get_registered_types()
        assert len(registered_types) == 5
        assert all(t in registered_types for t in ["direct", "query", "baseline", "batch", "event"])
        
        # Create providers and verify they're functional
        for eval_type in registered_types:
            provider = EvaluationProviderFactory.create(eval_type)
            
            # Basic functionality checks
            assert hasattr(provider, 'evaluate')
            assert hasattr(provider, 'get_evaluation_type')
            assert callable(provider.evaluate)
            assert callable(provider.get_evaluation_type)
            
            # Verify type consistency
            assert provider.get_evaluation_type() == eval_type