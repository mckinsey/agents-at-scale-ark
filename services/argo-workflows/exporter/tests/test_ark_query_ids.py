import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from argo_workflows_exporter.spans import node_span_id_for, trace_id_for

ARK_QUERY = Path(__file__).resolve().parents[2] / "chart" / "files" / "ark-query.py"


def load_ark_query():
    spec = importlib.util.spec_from_file_location("ark_query", ARK_QUERY)
    module = importlib.util.module_from_spec(spec)
    with patch.object(sys, "dont_write_bytecode", True):
        spec.loader.exec_module(module)
    return module


class TestArkQueryTraceparent(unittest.TestCase):
    def setUp(self):
        self.ark_query = load_ark_query()

    def test_derived_ids_match_the_exporter_step_span(self):
        with patch.dict(os.environ, {"ARK_ARGO_WORKFLOW_UID": "uid-1", "ARK_ARGO_NODE_ID": "wf-123"}, clear=True):
            traceparent = self.ark_query.argo_annotations()["ark.mckinsey.com/traceparent"]

        run = {"uid": "uid-1"}
        self.assertEqual(
            traceparent,
            f"00-{trace_id_for(run):032x}-{node_span_id_for(run, 'wf-123'):016x}-01",
        )

    def test_no_annotations_without_the_exporter(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.ark_query.argo_annotations(), {})


if __name__ == "__main__":
    unittest.main()
