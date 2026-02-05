import pytest
from unittest.mock import Mock, patch
from langchain_executor.utils import create_chat_client, create_embeddings_client


class TestAnthropicClientCreation:
    """Tests for Anthropic client creation in utils.py"""

    def test_create_chat_client_anthropic_success(self):
        """Test successful Anthropic chat client creation"""
        model = Mock()
        model.name = "claude-3-5-sonnet-20241022"
        model.type = "anthropic"
        model.config = {
            "anthropic": {
                "apiKey": "sk-ant-test-key",
                "baseUrl": "https://api.anthropic.com/v1",
                "properties": {
                    "temperature": "0.7",
                    "max_tokens": "2048"
                }
            }
        }

        with patch('langchain_executor.utils.ChatAnthropic') as mock_anthropic:
            mock_client = Mock()
            mock_anthropic.return_value = mock_client

            client = create_chat_client(model)

            mock_anthropic.assert_called_once()
            call_kwargs = mock_anthropic.call_args[1]
            assert call_kwargs['model'] == "claude-3-5-sonnet-20241022"
            assert call_kwargs['temperature'] == 0.7
            assert call_kwargs['max_tokens'] == 2048
            assert str(call_kwargs['anthropic_api_key']) == "sk-ant-test-key"

    def test_create_chat_client_anthropic_with_base_url(self):
        """Test Anthropic chat client creation with custom base URL"""
        model = Mock()
        model.name = "claude-3-haiku-20240307"
        model.type = "anthropic"
        model.config = {
            "anthropic": {
                "apiKey": "sk-ant-test-key",
                "baseUrl": "https://custom-gateway.com/anthropic",
                "properties": {
                    "temperature": "1.0",
                    "max_tokens": "4096"
                }
            }
        }

        with patch('langchain_executor.utils.ChatAnthropic') as mock_anthropic:
            mock_client = Mock()
            mock_anthropic.return_value = mock_client

            client = create_chat_client(model)

            call_kwargs = mock_anthropic.call_args[1]
            assert call_kwargs['anthropic_api_url'] == "https://custom-gateway.com/anthropic"

    def test_create_chat_client_anthropic_with_top_p_and_top_k(self):
        """Test Anthropic chat client creation with top_p and top_k parameters"""
        model = Mock()
        model.name = "claude-3-opus-20240229"
        model.type = "anthropic"
        model.config = {
            "anthropic": {
                "apiKey": "sk-ant-test-key",
                "baseUrl": "",
                "properties": {
                    "temperature": "0.5",
                    "max_tokens": "1024",
                    "top_p": "0.9",
                    "top_k": "40"
                }
            }
        }

        with patch('langchain_executor.utils.ChatAnthropic') as mock_anthropic:
            mock_client = Mock()
            mock_anthropic.return_value = mock_client

            client = create_chat_client(model)

            call_kwargs = mock_anthropic.call_args[1]
            assert call_kwargs['top_p'] == 0.9
            assert call_kwargs['top_k'] == 40

    def test_create_chat_client_anthropic_missing_api_key(self):
        """Test Anthropic chat client creation fails without API key"""
        model = Mock()
        model.name = "claude-3-haiku-20240307"
        model.type = "anthropic"
        model.config = {
            "anthropic": {
                "apiKey": "",
                "baseUrl": "https://api.anthropic.com/v1"
            }
        }

        with pytest.raises(ValueError, match="Anthropic requires apiKey"):
            create_chat_client(model)

    def test_create_chat_client_anthropic_default_properties(self):
        """Test Anthropic chat client creation with default properties"""
        model = Mock()
        model.name = "claude-3-haiku-20240307"
        model.type = "anthropic"
        model.config = {
            "anthropic": {
                "apiKey": "sk-ant-test-key",
                "baseUrl": "",
                "properties": {}
            }
        }

        with patch('langchain_executor.utils.ChatAnthropic') as mock_anthropic:
            mock_client = Mock()
            mock_anthropic.return_value = mock_client

            client = create_chat_client(model)

            call_kwargs = mock_anthropic.call_args[1]
            assert call_kwargs['temperature'] == 1.0
            assert call_kwargs['max_tokens'] == 4096

    def test_create_embeddings_client_anthropic_raises_error(self):
        """Test that Anthropic doesn't support embeddings"""
        model = Mock()
        model.name = "claude-3-haiku-20240307"
        model.type = "anthropic"
        model.config = {
            "anthropic": {
                "apiKey": "sk-ant-test-key",
                "baseUrl": "https://api.anthropic.com/v1"
            }
        }

        with pytest.raises(ValueError, match="Anthropic does not provide embeddings models"):
            create_embeddings_client(model)
