"""Tests for the pod/workflow log window paging logic."""
import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ["AUTH_MODE"] = "open"

from ark_api.api.v1 import resources
from ark_api.api.v1.resources import _LogWindowCollector, _read_history_window


def _line(index: int) -> str:
    return f"2024-01-01T00:00:{index:02d}.000000000Z line-{index}"


class _FakeContent:
    def __init__(self, data: bytes):
        self._data = data

    async def iter_chunked(self, _size: int):
        yield self._data


class _FakeResponse:
    def __init__(self, lines: list[str]):
        payload = ("\n".join(lines) + "\n").encode("utf-8")
        self.content = _FakeContent(payload)
        self.status = 200

    def release(self):
        return None


class TestLogWindowCollector(unittest.TestCase):
    """The collector's end-keeping behaviour under a byte/line budget."""

    def _feed(self, collector: _LogWindowCollector, lines: list[str]) -> None:
        for line in lines:
            collector.add(line)

    def test_keep_newest_false_keeps_the_oldest_page(self):
        collector = _LogWindowCollector(
            read_limit=3,
            max_bytes=1_000_000,
            min_timestamp=None,
            max_timestamp=None,
            keep_newest=False,
        )
        self._feed(collector, [_line(i) for i in range(11, 20)])

        window = collector.build(expect_more_before=True)

        self.assertEqual(window.content, "line-11\nline-12\nline-13")
        self.assertEqual(window.line_count, 3)
        self.assertTrue(window.has_more_before)

    def test_keep_newest_true_keeps_the_tail(self):
        collector = _LogWindowCollector(
            read_limit=3,
            max_bytes=1_000_000,
            min_timestamp=None,
            max_timestamp=None,
            keep_newest=True,
        )
        self._feed(collector, [_line(i) for i in range(11, 20)])

        window = collector.build(expect_more_before=True)

        self.assertEqual(window.content, "line-17\nline-18\nline-19")


class TestReadHistoryWindow(unittest.IsolatedAsyncioTestCase):
    """`skip_tail_lines` must be an honoured cursor even without a timestamp."""

    async def _read(self, skip_tail_lines: int, before_timestamp, response_lines):
        with (
            patch.object(
                resources,
                "_read_log_head_line",
                AsyncMock(return_value=(_line(0).split(" ")[0], 10)),
            ),
            patch.object(
                resources,
                "_measure_boundary_line_bytes",
                AsyncMock(return_value=40),
            ),
            patch.object(
                resources,
                "_open_pod_log_stream",
                AsyncMock(return_value=_FakeResponse(response_lines)),
            ),
        ):
            return await _read_history_window(
                core_v1=AsyncMock(),
                namespace="default",
                pod_name="pod-1",
                container="main",
                max_lines=3,
                skip_tail_lines=skip_tail_lines,
                before_timestamp=before_timestamp,
                max_bytes=1_000_000,
            )

    async def test_skip_without_before_returns_the_page_just_older_than_the_cursor(self):
        # kubelet returns the last skip+read+1 = 9 lines for this request.
        window = await self._read(
            skip_tail_lines=5,
            before_timestamp=None,
            response_lines=[_line(i) for i in range(11, 20)],
        )

        # The client's oldest line sits 5 from the end (line-14); the page must
        # be the three lines just older than it, not the tail (lines 17-19).
        self.assertEqual(window.content, "line-11\nline-12\nline-13")
        self.assertTrue(window.has_more_before)

    async def test_skip_zero_without_before_returns_the_tail(self):
        window = await self._read(
            skip_tail_lines=0,
            before_timestamp=None,
            response_lines=[_line(i) for i in range(17, 20)],
        )

        self.assertEqual(window.content, "line-17\nline-18\nline-19")


if __name__ == "__main__":
    unittest.main()
