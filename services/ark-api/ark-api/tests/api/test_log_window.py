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


# A full log of 30 numbered lines (line-1 oldest, line-30 newest). A kubelet
# tail_lines=N request returns the last N lines, which is what the fake honours.
_FULL_LOG = [_line(i) for i in range(1, 31)]


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

    async def _read(self, skip_tail_lines: int, before_timestamp):
        def open_stream(*_args, tail_lines: int, **_kwargs):
            return _FakeResponse(_FULL_LOG[-tail_lines:])

        with (
            patch.object(
                resources,
                "_read_log_head_line",
                AsyncMock(return_value=(_line(1).split(" ")[0], 10)),
            ),
            patch.object(
                resources,
                "_measure_boundary_line_bytes",
                AsyncMock(return_value=40),
            ),
            patch.object(
                resources,
                "_open_pod_log_stream",
                AsyncMock(side_effect=open_stream),
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

    async def test_skip_without_before_includes_the_line_adjacent_to_the_cursor(self):
        # Client holds the newest 5 lines (line-26..line-30); oldest held is
        # line-26. The page must be the three lines just older than it —
        # line-23, line-24, line-25 — and must NOT drop line-25, the line
        # directly adjacent to the client's oldest line.
        window = await self._read(skip_tail_lines=5, before_timestamp=None)

        self.assertEqual(window.content, "line-23\nline-24\nline-25")
        self.assertIn("line-25", window.content)
        self.assertTrue(window.has_more_before)

    async def test_skip_zero_without_before_returns_the_tail(self):
        window = await self._read(skip_tail_lines=0, before_timestamp=None)

        self.assertEqual(window.content, "line-28\nline-29\nline-30")


if __name__ == "__main__":
    unittest.main()
