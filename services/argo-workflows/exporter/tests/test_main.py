import base64
import unittest
from datetime import UTC, datetime
from unittest.mock import Mock, patch

from kubernetes.client.rest import ApiException
from opentelemetry.sdk.trace.export import SpanExportResult

from argo_workflows_exporter.config import Config
from argo_workflows_exporter.main import (
    Destinations,
    State,
    parse_headers,
    run_once,
    traces_endpoint,
)

NOW = datetime(2026, 11, 18, 10, 5, tzinfo=UTC)


def config(**overrides):
    values = {
        "namespaces": ["default"],
        "ark_api_url": "http://ark-api",
        "ark_api_public_key": "",
        "ark_api_secret_key": "",
        "poll_interval_seconds": 15,
        "lookback_seconds": 3600,
        "log_lines": 50,
        "otel_secret_name": "otel-environment-variables",
        "default_traces_endpoint": "",
        "default_headers": "",
    }
    values.update(overrides)
    return Config(**values)


def workflow(phase="Succeeded", node_phase="Succeeded", finished_at="2026-11-18T10:01:00Z"):
    return {
        "metadata": {"name": "wf", "namespace": "default", "uid": "uid-1"},
        "status": {
            "phase": phase,
            "finishedAt": finished_at,
            "nodes": {"wf-123": {"type": "Pod", "phase": node_phase}},
        },
    }


def run_body(phase="Succeeded", node_phase="Succeeded"):
    return {
        "name": "wf",
        "namespace": "default",
        "uid": "uid-1",
        "phase": phase,
        "started_at": "2026-11-18T10:00:00Z",
        "finished_at": "2026-11-18T10:01:00Z" if phase == "Succeeded" else None,
        "nodes": [{
            "id": "wf-123",
            "name": "wf[0].ask",
            "type": "Pod",
            "phase": node_phase,
            "started_at": "2026-11-18T10:00:05Z",
            "finished_at": "2026-11-18T10:00:30Z" if node_phase == "Succeeded" else None,
            "inputs": [],
            "outputs": [],
        }],
    }


def http_returning(body):
    response = Mock()
    response.json.return_value = body
    http = Mock()
    http.get.return_value = response
    return http


def destinations_with(exporter):
    destinations = Mock()
    destinations.for_namespace.return_value = exporter
    return destinations


def custom_listing(*workflows):
    custom = Mock()
    custom.list_namespaced_custom_object.return_value = {"items": list(workflows)}
    return custom


class TestHelpers(unittest.TestCase):
    def test_traces_endpoint_accepts_base_url_and_full_url(self):
        self.assertEqual(traces_endpoint("http://otel:4318"), "http://otel:4318/v1/traces")
        self.assertEqual(traces_endpoint("http://otel:4318/"), "http://otel:4318/v1/traces")
        self.assertEqual(traces_endpoint("http://otel:4318/v1/traces"), "http://otel:4318/v1/traces")
        self.assertEqual(traces_endpoint(""), "")

    def test_parse_headers_decodes_values(self):
        self.assertEqual(
            parse_headers("Authorization=Basic%20abc, x-langfuse-ingestion-version=4"),
            {"Authorization": "Basic abc", "x-langfuse-ingestion-version": "4"},
        )


class TestDestinations(unittest.TestCase):
    def _secret(self, **values):
        return Mock(data={k: base64.b64encode(v.encode()).decode() for k, v in values.items()})

    @patch("argo_workflows_exporter.main.OTLPSpanExporter")
    def test_reads_namespace_otel_secret(self, mock_exporter):
        core = Mock()
        core.read_namespaced_secret.return_value = self._secret(
            OTEL_EXPORTER_OTLP_ENDPOINT="http://langfuse/api/public/otel",
            OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic%20abc",
        )

        Destinations(core, config()).for_namespace("default")

        mock_exporter.assert_called_once_with(
            endpoint="http://langfuse/api/public/otel/v1/traces",
            headers={"Authorization": "Basic abc"},
        )

    @patch("argo_workflows_exporter.main.OTLPSpanExporter")
    def test_falls_back_to_default_endpoint_without_secret(self, mock_exporter):
        core = Mock()
        core.read_namespaced_secret.side_effect = ApiException(status=404)

        Destinations(core, config(default_traces_endpoint="http://otel:4318")).for_namespace("default")

        mock_exporter.assert_called_once_with(endpoint="http://otel:4318/v1/traces", headers={})

    @patch("argo_workflows_exporter.main.OTLPSpanExporter")
    def test_reuses_exporter_for_same_destination(self, mock_exporter):
        core = Mock()
        core.read_namespaced_secret.side_effect = ApiException(status=404)
        destinations = Destinations(core, config(default_traces_endpoint="http://otel:4318"))

        destinations.for_namespace("a")
        destinations.for_namespace("b")

        mock_exporter.assert_called_once()

    def test_no_destination_without_secret_or_default(self):
        core = Mock()
        core.read_namespaced_secret.side_effect = ApiException(status=404)

        self.assertIsNone(Destinations(core, config()).for_namespace("default"))

    def test_other_secret_errors_are_raised(self):
        core = Mock()
        core.read_namespaced_secret.side_effect = ApiException(status=403)

        with self.assertRaises(ApiException):
            Destinations(core, config()).for_namespace("default")


class TestRunOnce(unittest.TestCase):
    def test_exports_finished_steps_and_root_once(self):
        exporter = Mock()
        exporter.export.return_value = SpanExportResult.SUCCESS
        state = State()
        http = http_returning(run_body())

        run_once(config(), custom_listing(workflow()), destinations_with(exporter), http, state, NOW)
        run_once(config(), custom_listing(workflow()), destinations_with(exporter), http, state, NOW)

        exporter.export.assert_called_once()
        names = [span.name for span in exporter.export.call_args.args[0]]
        self.assertEqual(names, ["argo.step.wf-123", "argo.workflow.wf"])
        self.assertIn("uid-1", state.done)

    def test_ignores_argo_trace_ids_on_the_run(self):
        exporter = Mock()
        exporter.export.return_value = SpanExportResult.SUCCESS
        body = run_body()
        body["trace_id"] = "4bf92f3577b34da6a3ce929d0e0e4736"
        body["nodes"][0].update(trace_id="4bf92f3577b34da6a3ce929d0e0e4736", span_id="00f067aa0ba902b7")

        run_once(config(), custom_listing(workflow()), destinations_with(exporter), http_returning(body), State(), NOW)

        step, root = exporter.export.call_args.args[0]
        self.assertEqual(root.name, "argo.workflow.wf")
        self.assertEqual(step.parent.span_id, root.context.span_id)
        self.assertNotEqual(step.context.trace_id, int("4bf92f3577b34da6a3ce929d0e0e4736", 16))

    def test_finished_workflow_waits_for_ark_api_to_report_the_finish(self):
        exporter = Mock()
        exporter.export.return_value = SpanExportResult.SUCCESS
        state = State()
        body = {**run_body(), "finished_at": None}

        run_once(config(), custom_listing(workflow()), destinations_with(exporter), http_returning(body), state, NOW)

        (step,) = exporter.export.call_args.args[0]
        self.assertEqual(step.name, "argo.step.wf-123")
        self.assertNotIn("uid-1", state.done)

    def test_running_workflow_exports_finished_steps_without_root(self):
        exporter = Mock()
        exporter.export.return_value = SpanExportResult.SUCCESS
        state = State()

        run_once(
            config(),
            custom_listing(workflow(phase="Running", finished_at=None)),
            destinations_with(exporter),
            http_returning(run_body(phase="Running")),
            state,
            NOW,
        )

        names = [span.name for span in exporter.export.call_args.args[0]]
        self.assertEqual(names, ["argo.step.wf-123"])
        self.assertNotIn("uid-1", state.done)
        self.assertEqual(state.exported["uid-1"], {"wf-123"})

    def test_failed_export_is_retried(self):
        exporter = Mock()
        exporter.export.side_effect = [SpanExportResult.FAILURE, SpanExportResult.SUCCESS]
        state = State()
        http = http_returning(run_body())

        run_once(config(), custom_listing(workflow()), destinations_with(exporter), http, state, NOW)
        self.assertNotIn("uid-1", state.done)
        run_once(config(), custom_listing(workflow()), destinations_with(exporter), http, state, NOW)

        self.assertEqual(exporter.export.call_count, 2)
        self.assertIn("uid-1", state.done)

    def test_skips_workflows_finished_before_lookback(self):
        exporter = Mock()
        http = http_returning(run_body())

        run_once(
            config(lookback_seconds=60),
            custom_listing(workflow(finished_at="2026-11-18T09:00:00Z")),
            destinations_with(exporter),
            http,
            State(),
            NOW,
        )

        http.get.assert_not_called()
        exporter.export.assert_not_called()

    def test_skips_namespace_without_destination(self):
        custom = custom_listing(workflow())

        run_once(config(), custom, destinations_with(None), http_returning(run_body()), State(), NOW)

        custom.list_namespaced_custom_object.assert_not_called()

    def test_sends_api_key_as_basic_auth(self):
        exporter = Mock()
        exporter.export.return_value = SpanExportResult.SUCCESS
        http = http_returning(run_body())

        run_once(
            config(ark_api_public_key="pk", ark_api_secret_key="sk"),
            custom_listing(workflow()),
            destinations_with(exporter),
            http,
            State(),
            NOW,
        )

        self.assertEqual(http.get.call_args.kwargs["auth"], ("pk", "sk"))
        self.assertEqual(
            http.get.call_args.args[0],
            "http://ark-api/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/run",
        )

    def test_forgets_workflows_that_are_gone(self):
        state = State(exported={"old": {"n"}}, done={"old"})

        run_once(config(), custom_listing(), destinations_with(Mock()), http_returning({}), state, NOW)

        self.assertEqual((state.exported, state.done), ({}, set()))


if __name__ == "__main__":
    unittest.main()
