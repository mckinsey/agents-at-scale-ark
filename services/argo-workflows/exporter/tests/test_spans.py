import unittest

from opentelemetry.trace import StatusCode

from argo_workflows_exporter.spans import (
    is_exportable_node,
    needs_root_span,
    node_span,
    root_span,
    root_span_id_for,
    trace_id_for,
)

ARGO_TRACE = "4bf92f3577b34da6a3ce929d0e0e4736"
ARGO_SPAN = "00f067aa0ba902b7"


def run(trace_id=None, phase="Succeeded"):
    return {
        "name": "wf",
        "namespace": "default",
        "uid": "uid-1",
        "phase": phase,
        "started_at": "2026-11-18T10:00:00Z",
        "finished_at": "2026-11-18T10:01:00Z",
        "trace_id": trace_id,
        "nodes": [],
    }


def step(phase="Succeeded", span_id=ARGO_SPAN, message=None):
    return {
        "id": "wf-123",
        "name": "wf[0].ask",
        "display_name": "ask",
        "template_name": "query",
        "type": "Pod",
        "phase": phase,
        "started_at": "2026-11-18T10:00:05Z",
        "finished_at": "2026-11-18T10:00:30Z",
        "message": message,
        "inputs": [{"name": "input", "value": "hello"}],
        "outputs": [{"name": "response", "value": "hi"}],
        "exit_code": "0",
        "span_id": span_id,
        "log": {"excerpt": "line", "truncated": False, "source": "pod"},
    }


class TestNodeSpan(unittest.TestCase):
    def test_parents_on_argo_span_when_argo_tracing_is_on(self):
        span = node_span(run(trace_id=ARGO_TRACE), step())

        self.assertEqual(span.context.trace_id, int(ARGO_TRACE, 16))
        self.assertEqual(span.parent.span_id, int(ARGO_SPAN, 16))
        self.assertTrue(span.parent.is_remote)

    def test_parents_on_own_root_when_argo_tracing_is_off(self):
        r = run()
        span = node_span(r, step(span_id=None))

        self.assertEqual(span.context.trace_id, trace_id_for(r))
        self.assertEqual(span.parent.span_id, root_span_id_for(r))

    def test_carries_session_inputs_outputs_log_and_timings(self):
        span = node_span(run(trace_id=ARGO_TRACE), step())

        self.assertEqual(span.name, "argo.step.ask")
        self.assertEqual(span.attributes["session.id"], "wf-wf")
        self.assertEqual(span.attributes["input.value"], '{"input": "hello"}')
        self.assertEqual(span.attributes["output.value"], '{"response": "hi"}')
        self.assertEqual(span.attributes["argo.log.excerpt"], "line")
        self.assertEqual(span.attributes["argo.node.template"], "query")
        self.assertEqual(span.end_time - span.start_time, 25 * 1_000_000_000)
        self.assertEqual(span.status.status_code, StatusCode.OK)

    def test_failed_step_has_error_status(self):
        span = node_span(run(), step(phase="Failed", message="exit code 1"))

        self.assertEqual(span.status.status_code, StatusCode.ERROR)
        self.assertEqual(span.status.description, "exit code 1")

    def test_span_ids_are_stable(self):
        self.assertEqual(node_span(run(), step()).context.span_id, node_span(run(), step()).context.span_id)


class TestRootSpan(unittest.TestCase):
    def test_only_needed_without_argo_trace_and_once_finished(self):
        self.assertTrue(needs_root_span(run()))
        self.assertFalse(needs_root_span(run(trace_id=ARGO_TRACE)))
        self.assertFalse(needs_root_span({**run(phase="Running"), "finished_at": None}))

    def test_root_span_has_no_parent(self):
        span = root_span(run())

        self.assertIsNone(span.parent)
        self.assertEqual(span.context.span_id, root_span_id_for(run()))


class TestIsExportableNode(unittest.TestCase):
    def test_only_finished_pod_nodes(self):
        self.assertTrue(is_exportable_node(step()))
        self.assertFalse(is_exportable_node({**step(), "type": "Steps"}))
        self.assertFalse(is_exportable_node({**step(phase="Running"), "finished_at": None}))


if __name__ == "__main__":
    unittest.main()
