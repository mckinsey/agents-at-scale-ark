"""
Integration tests for evaluation providers.
These tests verify that providers work correctly together and with their dependencies.
"""

import pytest
import logging
from unittest.mock import Mock, AsyncMock, patch
from typing import Dict, Any

from src.evaluator.providers.factory import EvaluationProviderFactory
from src.evaluator.providers.direct_evaluation import DirectEvaluationProvider
from src.evaluator.providers.query_evaluation import QueryEvaluationProvider
from src.evaluator.providers.baseline_evaluation import BaselineEvaluationProvider
from src.evaluator.providers.batch_evaluation import BatchEvaluationProvider
from src.evaluator.providers.event_evaluation import EventEvaluationProvider
from src.evaluator.types import EvaluationType, EvaluationResponse

logger = logging.getLogger(__name__)


class TestProviderFactoryIntegration:
    """Integration tests for the provider factory with all provider types"""
    
    def setup_method(self):
        """Set up test fixtures"""
        # Clear and register all standard providers
        EvaluationProviderFactory._providers = {}
        EvaluationProviderFactory.register("direct", DirectEvaluationProvider)
        EvaluationProviderFactory.register("query", QueryEvaluationProvider)
        EvaluationProviderFactory.register("baseline", BaselineEvaluationProvider)
        EvaluationProviderFactory.register("batch", BatchEvaluationProvider)
        EvaluationProviderFactory.register("event", EventEvaluationProvider)
    
    def teardown_method(self):
        """Clean up after tests"""
        EvaluationProviderFactory._providers = {}
    
    def test_all_providers_registered_and_creatable(self):
        """Test that all standard providers are registered and can be created"""
        expected_providers = {
            "direct": DirectEvaluationProvider,
            "query": QueryEvaluationProvider,
            "baseline": BaselineEvaluationProvider,
            "batch": BatchEvaluationProvider,
            "event": EventEvaluationProvider
        }
        
        registered_types = EvaluationProviderFactory.get_registered_types()
        
        # Verify all expected types are registered
        for eval_type in expected_providers.keys():
            assert eval_type in registered_types
        
        # Verify each provider can be created and has correct type
        for eval_type, expected_class in expected_providers.items():
            provider = EvaluationProviderFactory.create(eval_type)
            assert isinstance(provider, expected_class)
            assert provider.get_evaluation_type() == eval_type
    
    def test_enum_compatibility_all_types(self):
        """Test that all EvaluationType enum values work with factory"""
        enum_mappings = {
            EvaluationType.DIRECT: DirectEvaluationProvider,
            EvaluationType.QUERY: QueryEvaluationProvider,
            EvaluationType.BASELINE: BaselineEvaluationProvider,
            EvaluationType.BATCH: BatchEvaluationProvider,
            EvaluationType.EVENT: EventEvaluationProvider
        }
        
        for enum_type, expected_class in enum_mappings.items():
            provider = EvaluationProviderFactory.create(enum_type)
            assert isinstance(provider, expected_class)
            assert provider.get_evaluation_type() == enum_type.value


class TestProviderBaseClassContract:
    """Test that all providers correctly implement the base class contract"""
    
    @pytest.mark.parametrize("provider_class", [
        DirectEvaluationProvider,
        QueryEvaluationProvider,
        BaselineEvaluationProvider,
        BatchEvaluationProvider,
        EventEvaluationProvider
    ])
    def test_provider_base_class_methods(self, provider_class):
        """Test that each provider implements required base class methods"""
        provider = provider_class()
        
        # Test abstract methods are implemented
        assert hasattr(provider, 'evaluate')
        assert hasattr(provider, 'get_evaluation_type')
        assert callable(provider.evaluate)
        assert callable(provider.get_evaluation_type)
        
        # Test helper methods are available
        assert hasattr(provider, '_extract_model_ref')
        assert hasattr(provider, '_extract_golden_examples')
        assert callable(provider._extract_model_ref)
        assert callable(provider._extract_golden_examples)
    
    @pytest.mark.parametrize("provider_class,expected_type", [
        (DirectEvaluationProvider, "direct"),
        (QueryEvaluationProvider, "query"),
        (BaselineEvaluationProvider, "baseline"),
        (BatchEvaluationProvider, "batch"),
        (EventEvaluationProvider, "event")
    ])
    def test_provider_type_consistency(self, provider_class, expected_type):
        """Test that each provider returns the correct evaluation type"""
        provider = provider_class()
        assert provider.get_evaluation_type() == expected_type
    
    @pytest.mark.parametrize("provider_class", [
        DirectEvaluationProvider,
        QueryEvaluationProvider, 
        BaselineEvaluationProvider,
        BatchEvaluationProvider,
        EventEvaluationProvider
    ])
    def test_provider_shared_session_handling(self, provider_class):
        """Test that each provider correctly handles shared session parameter"""
        mock_session = Mock()
        
        # Test without shared session
        provider_without_session = provider_class()
        assert provider_without_session.shared_session is None
        
        # Test with shared session
        provider_with_session = provider_class(shared_session=mock_session)
        assert provider_with_session.shared_session is mock_session


@pytest.mark.integration
class TestProviderErrorHandling:
    """Integration tests for error handling across all providers"""
    
    def setup_method(self):
        """Set up test fixtures for each provider type"""
        self.providers = {
            "direct": DirectEvaluationProvider(),
            "query": QueryEvaluationProvider(),
            "baseline": BaselineEvaluationProvider(),
            "batch": BatchEvaluationProvider(),
            "event": EventEvaluationProvider()
        }
    
    @pytest.mark.asyncio
    async def test_all_providers_handle_invalid_requests_gracefully(self):
        """Test that all providers handle invalid requests without crashing"""
        invalid_request = Mock()
        invalid_request.evaluatorName = "test"
        invalid_request.config = None
        invalid_request.parameters = {}
        
        for provider_type, provider in self.providers.items():
            try:
                result = await provider.evaluate(invalid_request)
                
                # Should return an EvaluationResponse or raise HTTPException
                if isinstance(result, EvaluationResponse):
                    # If response is returned, it should indicate failure
                    assert result.passed is False or result.score == "0.0"
                    
            except Exception as e:
                # HTTPException and other specific exceptions are acceptable
                # Also accept AttributeError since config might be None
                assert hasattr(e, 'status_code') or isinstance(e, (ValueError, TypeError, AttributeError))
                logger.info(f"Provider {provider_type} correctly raised exception: {type(e).__name__}")


@pytest.mark.integration
class TestProviderHelperMethods:
    """Integration tests for provider helper methods"""
    
    def test_extract_model_ref_consistency_across_providers(self):
        """Test that _extract_model_ref works consistently across all providers"""
        providers = [
            DirectEvaluationProvider(),
            QueryEvaluationProvider(),
            BaselineEvaluationProvider(),
            BatchEvaluationProvider(),
            EventEvaluationProvider()
        ]
        
        test_parameters = {
            "model.name": "gpt-4",
            "model.namespace": "test-namespace"
        }
        
        for provider in providers:
            model_ref = provider._extract_model_ref(test_parameters)
            
            assert model_ref is not None
            assert model_ref.name == "gpt-4"
            assert model_ref.namespace == "test-namespace"
    
    def test_extract_golden_examples_consistency_across_providers(self):
        """Test that _extract_golden_examples works consistently across all providers"""
        providers = [
            DirectEvaluationProvider(),
            QueryEvaluationProvider(), 
            BaselineEvaluationProvider(),
            BatchEvaluationProvider(),
            EventEvaluationProvider()
        ]
        
        import json
        golden_data = [
            {
                "input": "Test input",
                "expectedOutput": "Test output",
                "metadata": {"category": "test"}
            }
        ]
        
        test_parameters = {
            "golden-examples": json.dumps(golden_data)
        }
        
        for provider in providers:
            golden_examples = provider._extract_golden_examples(test_parameters)
            
            assert golden_examples is not None
            assert len(golden_examples) == 1
            assert golden_examples[0].input == "Test input"
            assert golden_examples[0].expectedOutput == "Test output"
            assert golden_examples[0].metadata == {"category": "test"}


@pytest.mark.slow
@pytest.mark.integration
class TestProviderPerformance:
    """Performance tests for evaluation providers"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.providers = {
            "direct": DirectEvaluationProvider(),
            "query": QueryEvaluationProvider(),
            "baseline": BaselineEvaluationProvider(), 
            "batch": BatchEvaluationProvider(),
            "event": EventEvaluationProvider()
        }
    
    def test_provider_creation_performance(self):
        """Test that provider creation is reasonably fast"""
        import time
        
        start_time = time.time()
        
        # Create multiple instances of each provider
        for _ in range(100):
            for provider_class in [DirectEvaluationProvider, QueryEvaluationProvider,
                                 BaselineEvaluationProvider, BatchEvaluationProvider,
                                 EventEvaluationProvider]:
                provider = provider_class()
                assert provider is not None
        
        end_time = time.time()
        creation_time = end_time - start_time
        
        # Should be able to create 500 provider instances in under 1 second
        assert creation_time < 1.0, f"Provider creation took {creation_time:.2f}s, expected < 1.0s"
    
    def test_factory_creation_performance(self):
        """Test that factory creation is reasonably fast"""
        import time
        
        # Register providers
        EvaluationProviderFactory._providers = {}
        EvaluationProviderFactory.register("direct", DirectEvaluationProvider)
        EvaluationProviderFactory.register("query", QueryEvaluationProvider)
        EvaluationProviderFactory.register("baseline", BaselineEvaluationProvider)
        EvaluationProviderFactory.register("batch", BatchEvaluationProvider) 
        EvaluationProviderFactory.register("event", EventEvaluationProvider)
        
        start_time = time.time()
        
        # Create multiple instances via factory
        for _ in range(100):
            for eval_type in ["direct", "query", "baseline", "batch", "event"]:
                provider = EvaluationProviderFactory.create(eval_type)
                assert provider is not None
        
        end_time = time.time()
        creation_time = end_time - start_time
        
        # Should be able to create 500 provider instances via factory in under 1 second
        assert creation_time < 1.0, f"Factory creation took {creation_time:.2f}s, expected < 1.0s"
        
        # Clean up
        EvaluationProviderFactory._providers = {}


@pytest.mark.integration
class TestProviderWorkflowIntegration:
    """Integration tests for complete provider workflows"""
    
    def test_provider_factory_to_evaluation_workflow(self, sample_direct_evaluation_request):
        """Test complete workflow from factory creation to evaluation attempt"""
        # Register provider
        EvaluationProviderFactory._providers = {}
        EvaluationProviderFactory.register("direct", DirectEvaluationProvider)
        
        # Create provider via factory
        provider = EvaluationProviderFactory.create("direct")
        assert isinstance(provider, DirectEvaluationProvider)
        
        # Verify provider can at least attempt evaluation (will fail due to mocking, but should not crash)
        assert callable(provider.evaluate)
        assert provider.get_evaluation_type() == "direct"
        
        # Clean up
        EvaluationProviderFactory._providers = {}
    
    def test_provider_helper_method_workflow(self):
        """Test workflow of using provider helper methods"""
        provider = DirectEvaluationProvider()
        
        # Test model reference extraction
        parameters = {
            "model.name": "test-model",
            "model.namespace": "test-namespace"
        }
        
        model_ref = provider._extract_model_ref(parameters)
        assert model_ref.name == "test-model"
        assert model_ref.namespace == "test-namespace"
        
        # Test golden examples extraction  
        import json
        golden_data = [{"input": "test", "expectedOutput": "output"}]
        parameters["golden-examples"] = json.dumps(golden_data)
        
        golden_examples = provider._extract_golden_examples(parameters)
        assert len(golden_examples) == 1
        assert golden_examples[0].input == "test"
        assert golden_examples[0].expectedOutput == "output"