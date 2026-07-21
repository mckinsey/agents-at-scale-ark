"""Tests for the logging contract: raw query/prompt/response payload content is
verbose-only (DEBUG) and never emitted at the default INFO level.

These assert the *behaviour* the Logging Contract docs promise
(docs/content/operations-guide/logging-contract.mdx) for the ark-api call sites
that were demoted from INFO to DEBUG, so the guarantee can't silently regress.
"""
from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from ark_api.api.v1.a2agw.execution import ARKAgentExecutor
from ark_api.utils.query_watch import _get_error_detail

A2A_LOGGER = "ark_api.api.v1.a2agw.execution"
QUERY_WATCH_LOGGER = "ark_api.utils.query_watch"


class TestQueryWatchErrorDetailContract:
    """``_get_error_detail`` keeps model-output ``response`` content out of INFO logs."""

    def _status(self) -> dict:
        return {
            "message": "query failed",
            "response": {"content": "SECRET-MODEL-OUTPUT-42"},
        }

    def test_response_content_absent_at_info(self, caplog):
        with caplog.at_level(logging.INFO, logger=QUERY_WATCH_LOGGER):
            _get_error_detail(self._status())
        assert "SECRET-MODEL-OUTPUT-42" not in caplog.text
        # The error message (metadata) is still logged at INFO.
        assert "query failed" in caplog.text

    def test_response_content_present_at_debug(self, caplog):
        with caplog.at_level(logging.DEBUG, logger=QUERY_WATCH_LOGGER):
            _get_error_detail(self._status())
        assert "SECRET-MODEL-OUTPUT-42" in caplog.text


@pytest.mark.asyncio
class TestA2AExecutorPromptContract:
    """The A2A executor keeps the raw user prompt out of INFO logs."""

    def _context(self, text: str):
        # _extract_message_text walks message.parts looking for a text part.
        part = SimpleNamespace(kind="text", text=text)
        message = SimpleNamespace(parts=[part])
        return SimpleNamespace(task_id="t-1", context_id="c-1", message=message)

    def _executor(self) -> ARKAgentExecutor:
        ex = ARKAgentExecutor(target_name="agent-x", namespace="default", timeout=5)

        # Neutralise the query round-trip and status updates so only the two log
        # lines under test (the INFO metadata line and the DEBUG prompt line) run.
        async def _fake_process(_msg):
            return "OK"

        ex._process_query = _fake_process
        ex._send_task_update = AsyncMock()
        return ex

    async def _run(self, prompt: str) -> None:
        ex = self._executor()
        event_queue = SimpleNamespace(enqueue_event=AsyncMock())
        await ex.execute(self._context(prompt), event_queue)

    async def test_prompt_absent_at_info(self, caplog):
        prompt = "PROMPT-SECRET-BODY-99"
        with caplog.at_level(logging.INFO, logger=A2A_LOGGER):
            await self._run(prompt)
        assert prompt not in caplog.text
        # The metadata "Processing query" line is still emitted at INFO.
        assert "Processing query" in caplog.text

    async def test_prompt_present_at_debug(self, caplog):
        prompt = "PROMPT-SECRET-BODY-99"
        with caplog.at_level(logging.DEBUG, logger=A2A_LOGGER):
            await self._run(prompt)
        assert prompt in caplog.text
