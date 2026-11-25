import unittest

from opentelemetry.trace import StatusCode

from argo_workflows_exporter.spans import (
    is_exportable_node,
    is_finished_run,
    node_span,
    root_span,
    root_span_id_for,
    trace_id_for,
)


def run(phase="Succeeded"):
    return {
        "name": "wf",
        "namespace": "default",
        "uid": "uid-1",
        "phase": phase,
        "started_at": "2026-11-18T10:00:00Z",
        "finished_at": "2026-11-18T10:01:00Z",
        "nodes": [],
    }


def step(phase="Succeeded", message=None):
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
        "log": {"excerpt": "line", "truncated": False, "source": "pod"},
    }


class TestNodeSpan(unittest.TestCase):
    def test_parents_on_the_workflow_root_span(self):
        r = run()
        span = node_span(r, step())

        self.assertEqual(span.context.trace_id, trace_id_for(r))
        self.assertEqual(span.parent.span_id, root_span_id_for(r))
        self.assertTrue(span.parent.is_remote)

    def test_carries_session_inputs_outputs_log_and_timings(self):
        span = node_span(run(), step())

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
    def test_sent_once_the_run_is_finished(self):
        self.assertTrue(is_finished_run(run()))
        self.assertFalse(is_finished_run({**run(phase="Running"), "finished_at": None}))
        self.assertFalse(is_finished_run({**run(), "finished_at": None}))

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
