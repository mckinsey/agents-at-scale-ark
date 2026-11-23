import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from argo_workflows_exporter.spans import node_span_id_for, trace_id_for

ARK_QUERY = Path(__file__).resolve().parents[2] / "chart" / "files" / "ark-query.py"


def load_ark_query():
    spec = importlib.util.spec_from_file_location("ark_query", ARK_QUERY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestArkQueryTraceparent(unittest.TestCase):
    def setUp(self):
        self.ark_query = load_ark_query()

    def test_derived_ids_match_the_exporter_step_span(self):
        with patch.dict(os.environ, {"ARK_ARGO_WORKFLOW_UID": "uid-1", "ARK_ARGO_NODE_ID": "wf-123"}, clear=True):
            traceparent = self.ark_query.argo_annotations()["ark.mckinsey.com/traceparent"]

        run = {"uid": "uid-1", "trace_id": None}
        self.assertEqual(
            traceparent,
            f"00-{trace_id_for(run):032x}-{node_span_id_for(run, 'wf-123'):016x}-01",
        )

    def test_argo_span_ids_take_precedence(self):
        env = {
            "ARK_ARGO_TRACE_ID": "4bf92f3577b34da6a3ce929d0e0e4736",
            "ARK_ARGO_SPAN_ID": "00f067aa0ba902b7",
            "ARK_ARGO_WORKFLOW_UID": "uid-1",
            "ARK_ARGO_NODE_ID": "wf-123",
        }
        with patch.dict(os.environ, env, clear=True):
            traceparent = self.ark_query.argo_annotations()["ark.mckinsey.com/traceparent"]

        self.assertEqual(traceparent, "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")

    def test_no_traceparent_without_exporter_or_argo_tracing(self):
        with patch.dict(os.environ, {"ARK_ARGO_NODE_ID": "wf-123"}, clear=True):
            annotations = self.ark_query.argo_annotations()

        self.assertEqual(annotations, {"ark.mckinsey.com/argo-node-id": "wf-123"})


if __name__ == "__main__":
    unittest.main()
