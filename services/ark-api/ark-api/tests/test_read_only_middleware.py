import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from ark_api.middleware import ReadOnlyMiddleware


class TestReadOnlyMiddleware(unittest.IsolatedAsyncioTestCase):

    @patch.dict(os.environ, {"READ_ONLY_MODE": "false"})
    async def test_read_only_disabled_allows_writes(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "POST"
        request.url.path = "/api/v1/agents"

        call_next = AsyncMock()
        call_next.return_value = Mock(status_code=201)

        response = await middleware.dispatch(request, call_next)

        call_next.assert_called_once_with(request)
        self.assertEqual(response.status_code, 201)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_blocks_post(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "POST"
        request.url.path = "/api/v1/agents"

        call_next = AsyncMock()

        response = await middleware.dispatch(request, call_next)

        call_next.assert_not_called()
        self.assertEqual(response.status_code, 403)
        self.assertIn(b"demo environment", response.body)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_blocks_put(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "PUT"
        request.url.path = "/api/v1/agents/test"

        call_next = AsyncMock()

        response = await middleware.dispatch(request, call_next)

        call_next.assert_not_called()
        self.assertEqual(response.status_code, 403)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_blocks_patch(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "PATCH"
        request.url.path = "/api/v1/agents/test"

        call_next = AsyncMock()

        response = await middleware.dispatch(request, call_next)

        call_next.assert_not_called()
        self.assertEqual(response.status_code, 403)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_blocks_delete(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "DELETE"
        request.url.path = "/api/v1/agents/test"

        call_next = AsyncMock()

        response = await middleware.dispatch(request, call_next)

        call_next.assert_not_called()
        self.assertEqual(response.status_code, 403)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_allows_get(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "GET"
        request.url.path = "/api/v1/agents"

        call_next = AsyncMock()
        call_next.return_value = Mock(status_code=200)

        response = await middleware.dispatch(request, call_next)

        call_next.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_allows_get_teams(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "GET"
        request.url.path = "/v1/teams"

        call_next = AsyncMock()
        call_next.return_value = Mock(status_code=200)

        response = await middleware.dispatch(request, call_next)

        call_next.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_allows_get_queries(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "GET"
        request.url.path = "/v1/queries"

        call_next = AsyncMock()
        call_next.return_value = Mock(status_code=200)

        response = await middleware.dispatch(request, call_next)

        call_next.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_allows_get_agent_by_id(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "GET"
        request.url.path = "/v1/agents/my-agent"

        call_next = AsyncMock()
        call_next.return_value = Mock(status_code=200)

        response = await middleware.dispatch(request, call_next)

        call_next.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_allows_chat_completions(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "POST"
        request.url.path = "/openai/v1/chat/completions"

        call_next = AsyncMock()
        call_next.return_value = Mock(status_code=200)

        response = await middleware.dispatch(request, call_next)

        call_next.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_allows_queries(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "POST"
        request.url.path = "/v1/queries"

        call_next = AsyncMock()
        call_next.return_value = Mock(status_code=201)

        response = await middleware.dispatch(request, call_next)

        call_next.assert_called_once_with(request)
        self.assertEqual(response.status_code, 201)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_blocks_create_agent(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "POST"
        request.url.path = "/v1/agents"

        call_next = AsyncMock()

        response = await middleware.dispatch(request, call_next)

        call_next.assert_not_called()
        self.assertEqual(response.status_code, 403)
        self.assertIn(b"demo environment", response.body)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_blocks_create_team(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "POST"
        request.url.path = "/v1/teams"

        call_next = AsyncMock()

        response = await middleware.dispatch(request, call_next)

        call_next.assert_not_called()
        self.assertEqual(response.status_code, 403)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_blocks_create_model(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "POST"
        request.url.path = "/v1/models"

        call_next = AsyncMock()

        response = await middleware.dispatch(request, call_next)

        call_next.assert_not_called()
        self.assertEqual(response.status_code, 403)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"})
    async def test_read_only_enabled_blocks_update_agent(self):
        middleware = ReadOnlyMiddleware(Mock())

        request = Mock()
        request.method = "PUT"
        request.url.path = "/v1/agents/my-agent"

        call_next = AsyncMock()

        response = await middleware.dispatch(request, call_next)

        call_next.assert_not_called()
        self.assertEqual(response.status_code, 403)
