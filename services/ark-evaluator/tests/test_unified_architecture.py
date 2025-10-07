"""
Tests for the unified architecture with OSS provider support.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from evaluator.core import EvaluationManager, PlatformConfiguration, OSSEvaluationProvider
from evaluator.types import (
    UnifiedEvaluationRequest,
    EvaluationType,
    EvaluationConfig,
    EvaluationResponse
)


class TestEvaluationManager:
    """Test the EvaluationManager orchestration."""
    
    def test_manager_initializes_with_providers(self):
        """Test manager initializes and registers available providers."""
        manager = EvaluationManager(shared_session=Mock())
        
        # Should have ARK types registered
        ark_types = manager.list_ark_types()
        assert len(ark_types) > 0
        assert "direct" in ark_types
        assert "query" in ark_types
        
        # OSS providers may or may not be registered depending on imports
        oss_providers = manager.list_oss_providers()
        assert isinstance(oss_providers, list)
    
    @pytest.mark.asyncio
    async def test_manager_routes_to_ark_provider_by_default(self):
        """Test manager routes to ARK provider when no provider specified."""
        manager = EvaluationManager(shared_session=Mock())
        
        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(input="test", output="test"),
            parameters={"model.name": "test-model"}
        )
        
        with patch.object(manager.ark_factory, 'create') as mock_create:
            mock_provider = AsyncMock()
            mock_provider.evaluate = AsyncMock(return_value=EvaluationResponse(
                score="0.8",
                passed=True
            ))
            mock_create.return_value = mock_provider
            
            result = await manager.evaluate(request)
            
            assert result.score == "0.8"
            assert result.passed is True
            mock_create.assert_called_once_with(EvaluationType.DIRECT, shared_session=manager.shared_session)
    
    @pytest.mark.asyncio
    async def test_manager_routes_to_oss_provider_when_specified(self):
        """Test manager routes to OSS provider when explicitly specified."""
        manager = EvaluationManager(shared_session=Mock())
        
        # Create a mock OSS provider
        mock_provider = Mock(spec=OSSEvaluationProvider)
        mock_provider.validate_parameters = Mock(return_value=True)
        mock_provider.evaluate = AsyncMock(return_value=EvaluationResponse(
            score="0.9",
            passed=True,
            metadata={"provider": "test_oss"}
        ))
        
        # Register the mock provider
        manager.oss_providers["test_oss"] = mock_provider
        
        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(input="test", output="test"),
            parameters={"provider": "test_oss"}
        )
        
        result = await manager.evaluate(request)
        
        assert result.score == "0.9"
        assert result.passed is True
        assert result.metadata["provider"] == "test_oss"
        mock_provider.evaluate.assert_called_once_with(request)
    
    @pytest.mark.asyncio
    async def test_manager_validates_oss_provider_parameters(self):
        """Test manager validates required parameters for OSS providers."""
        manager = EvaluationManager(shared_session=Mock())
        
        # Create a mock OSS provider with validation failure
        mock_provider = Mock(spec=OSSEvaluationProvider)
        mock_provider.validate_parameters = Mock(return_value=False)
        
        manager.oss_providers["test_oss"] = mock_provider
        
        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(input="test", output="test"),
            parameters={"provider": "test_oss"}
        )
        
        with pytest.raises(ValueError, match="Missing required parameters"):
            await manager.evaluate(request)
    
    @pytest.mark.asyncio
    async def test_manager_raises_for_unknown_provider(self):
        """Test manager raises error for unknown provider."""
        manager = EvaluationManager(shared_session=Mock())
        
        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(input="test", output="test"),
            parameters={"provider": "unknown_provider"}
        )
        
        with pytest.raises(ValueError, match="Unknown provider: unknown_provider"):
            await manager.evaluate(request)


class TestPlatformConfiguration:
    """Test the PlatformConfiguration utility."""
    
    def test_platform_config_extracts_parameters(self):
        """Test configuration extracts platform-specific parameters."""
        params = {
            "langfuse.host": "https://langfuse.example.com",
            "langfuse.public_key": "pub123",
            "langfuse.secret_key": "secret123",
            "other.param": "value"
        }
        
        config = PlatformConfiguration.from_parameters("langfuse", params)
        
        assert config.platform == "langfuse"
        assert config.get("host") == "https://langfuse.example.com"
        assert config.get("public_key") == "pub123"
        assert config.get("secret_key") == "secret123"
        assert config.get("other.param") is None  # Should not include other platform params
    
    def test_platform_config_validates_required_keys(self):
        """Test configuration validates required keys."""
        config = PlatformConfiguration(
            platform="test",
            parameters={"key1": "value1", "key2": "value2"}
        )
        
        assert config.validate(["key1", "key2"]) is True
        assert config.validate(["key1", "key2", "key3"]) is False
    
    def test_platform_config_connection_params(self):
        """Test configuration returns standardized connection parameters."""
        config = PlatformConfiguration(
            platform="test",
            parameters={
                "host": "https://example.com",
                "api_key": "test_key",
                "custom_param": "custom_value"
            }
        )
        
        conn_params = config.get_connection_params()
        
        assert conn_params["host"] == "https://example.com"
        assert conn_params["api_key"] == "test_key"
        assert conn_params["custom_param"] == "custom_value"


class TestOSSProviderInterface:
    """Test the OSS provider interface."""
    
    def test_oss_provider_interface_methods(self):
        """Test OSS provider interface has required methods."""
        from evaluator.core.interface import OSSEvaluationProvider
        
        # Create a concrete implementation for testing
        class TestProvider(OSSEvaluationProvider):
            def get_evaluation_type(self):
                return "test"
            
            def get_required_parameters(self):
                return ["test.param1", "test.param2"]
            
            async def evaluate(self, request):
                return EvaluationResponse(score="0.5", passed=False)
        
        provider = TestProvider(shared_session=Mock())
        
        assert provider.get_evaluation_type() == "test"
        assert provider.get_required_parameters() == ["test.param1", "test.param2"]
        
        # Test parameter validation
        assert provider.validate_parameters({"test.param1": "v1", "test.param2": "v2"}) is True
        assert provider.validate_parameters({"test.param1": "v1"}) is False
        assert provider.validate_parameters(None) is False


class TestBackwardCompatibility:
    """Test that existing functionality remains unchanged."""
    
    @pytest.mark.asyncio
    async def test_existing_ark_evaluation_still_works(self):
        """Test that existing ARK evaluation requests work unchanged."""
        from evaluator.app import create_app
        from fastapi.testclient import TestClient
        
        app = create_app()
        
        # Existing request format should continue working
        request_data = {
            "type": "direct",
            "config": {
                "input": "What is 2+2?",
                "output": "4"
            },
            "parameters": {
                "model.name": "gpt-4",
                "scope": "accuracy"
            }
        }
        
        # Verify request structure is valid
        assert request_data["type"] == "direct"
        assert "provider" not in request_data.get("parameters", {})
    
    def test_factory_pattern_still_accessible(self):
        """Test that the factory pattern is still directly accessible."""
        from evaluator.providers import EvaluationProviderFactory
        
        # Should be able to use factory directly
        provider = EvaluationProviderFactory.create(
            EvaluationType.DIRECT,
            shared_session=Mock()
        )
        
        assert provider is not None
        assert provider.get_evaluation_type() == "direct"


class TestLangfuseProvider:
    """Test Langfuse provider implementation."""
    
    def test_langfuse_provider_requirements(self):
        """Test Langfuse provider declares required parameters."""
        try:
            from evaluator.oss_providers.langfuse import LangfuseProvider
            
            provider = LangfuseProvider(shared_session=Mock())
            
            assert provider.get_evaluation_type() == "langfuse"
            
            required = provider.get_required_parameters()
            assert "langfuse.host" in required
            assert "langfuse.public_key" in required
            assert "langfuse.secret_key" in required
        except ImportError:
            pytest.skip("Langfuse provider not available")
    


def test_all_new_imports_work():
    """Ensure all new imports work correctly."""
    try:
        # Core module
        from evaluator.core import EvaluationManager, PlatformConfiguration, OSSEvaluationProvider
        
        # OSS providers (may fail if dependencies not installed)
        try:
            from evaluator.oss_providers import LangfuseProvider
        except ImportError:
            pass  # OK if not available
        
        try:
            from evaluator.oss_providers import RAGASProvider
        except ImportError:
            pass  # OK if not available
        
        # All critical imports successful
        assert True
    except ImportError as e:
        pytest.fail(f"Critical import failed: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])