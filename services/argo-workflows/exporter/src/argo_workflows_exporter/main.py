import base64
import logging
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import quote, unquote

import httpx
from kubernetes import client
from kubernetes import config as k8s_config
from kubernetes.client.rest import ApiException
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import SpanExportResult

from .config import Config, load_config
from .spans import (
    FINISHED_PHASES,
    is_exportable_node,
    needs_root_span,
    node_span,
    root_span,
)

logger = logging.getLogger("argo_workflows_exporter")

WORKFLOW_GROUP = "argoproj.io"
WORKFLOW_VERSION = "v1alpha1"
WORKFLOW_PLURAL = "workflows"
ARK_API_TIMEOUT_SECONDS = 30.0


def traces_endpoint(endpoint: str) -> str:
    endpoint = endpoint.strip().rstrip("/")
    if not endpoint or endpoint.endswith("/v1/traces"):
        return endpoint
    return endpoint + "/v1/traces"


def parse_headers(raw: str) -> dict:
    headers = {}
    for pair in raw.split(","):
        if "=" not in pair:
            continue
        key, value = pair.split("=", 1)
        headers[key.strip()] = unquote(value.strip())
    return headers


def _secret_value(secret, key: str) -> str:
    value = (secret.data or {}).get(key)
    return base64.b64decode(value).decode() if value else ""


@dataclass
class Destinations:
    core: client.CoreV1Api
    config: Config
    exporters: dict = field(default_factory=dict)

    def for_namespace(self, namespace: str) -> OTLPSpanExporter | None:
        endpoint, headers = self.config.default_traces_endpoint, self.config.default_headers
        try:
            secret = self.core.read_namespaced_secret(self.config.otel_secret_name, namespace)
        except ApiException as e:
            if e.status != 404:
                raise
            secret = None
        if secret is not None:
            endpoint = (
                _secret_value(secret, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
                or _secret_value(secret, "OTEL_EXPORTER_OTLP_ENDPOINT")
                or endpoint
            )
            headers = (
                _secret_value(secret, "OTEL_EXPORTER_OTLP_TRACES_HEADERS")
                or _secret_value(secret, "OTEL_EXPORTER_OTLP_HEADERS")
                or headers
            )
        endpoint = traces_endpoint(endpoint)
        if not endpoint:
            return None
        key = (endpoint, headers)
        if key not in self.exporters:
            self.exporters[key] = OTLPSpanExporter(endpoint=endpoint, headers=parse_headers(headers))
        return self.exporters[key]


@dataclass
class State:
    exported: dict = field(default_factory=dict)
    done: set = field(default_factory=set)

    def prune(self, seen: set) -> None:
        self.exported = {uid: nodes for uid, nodes in self.exported.items() if uid in seen}
        self.done &= seen


def _parse_time(timestamp: str | None) -> datetime | None:
    if not timestamp:
        return None
    return datetime.fromisoformat(timestamp)


def _finished_before_lookback(status: dict, now: datetime, lookback_seconds: float) -> bool:
    finished_at = _parse_time(status.get("finishedAt"))
    return finished_at is not None and (now - finished_at).total_seconds() > lookback_seconds


def _has_unexported_nodes(status: dict, exported: set) -> bool:
    return any(
        node.get("type") == "Pod" and node.get("phase") in FINISHED_PHASES and node_id not in exported
        for node_id, node in (status.get("nodes") or {}).items()
    )


def fetch_run(http: httpx.Client, config: Config, namespace: str, name: str) -> dict:
    url = (
        f"{config.ark_api_url}/v1/resources/apis/argoproj.io/v1alpha1/namespaces/"
        f"{quote(namespace, safe='')}/workflows/{quote(name, safe='')}/run"
    )
    auth = None
    if config.ark_api_public_key and config.ark_api_secret_key:
        auth = (config.ark_api_public_key, config.ark_api_secret_key)
    response = http.get(url, params={"log_lines": config.log_lines}, auth=auth)
    response.raise_for_status()
    return response.json()


def without_argo_trace(run: dict) -> dict:
    return {
        **run,
        "trace_id": None,
        "nodes": [{**node, "trace_id": None, "span_id": None} for node in run["nodes"]],
    }


def export_workflow(
    http: httpx.Client,
    config: Config,
    exporter: OTLPSpanExporter,
    state: State,
    workflow: dict,
) -> None:
    metadata = workflow["metadata"]
    uid = metadata["uid"]
    exported = state.exported.setdefault(uid, set())
    status = workflow.get("status") or {}
    finished = status.get("phase") in FINISHED_PHASES

    if not finished and not _has_unexported_nodes(status, exported):
        return

    run = fetch_run(http, config, metadata["namespace"], metadata["name"])
    if not config.argo_tracing_enabled:
        run = without_argo_trace(run)
    nodes = [node for node in run["nodes"] if is_exportable_node(node) and node["id"] not in exported]
    spans = [node_span(run, node) for node in nodes]
    send_root = finished and needs_root_span(run)
    if send_root:
        spans.append(root_span(run))
    if spans:
        result = exporter.export(spans)
        if result != SpanExportResult.SUCCESS:
            logger.warning(f"Export of {len(spans)} spans for workflow {metadata['name']} failed, retrying next poll")
            return
        logger.info(f"Exported {len(spans)} spans for workflow {metadata['namespace']}/{metadata['name']}")
    exported.update(node["id"] for node in nodes)
    if finished and (send_root or not needs_root_span(run)):
        state.done.add(uid)


def run_once(
    config: Config,
    custom: client.CustomObjectsApi,
    destinations: Destinations,
    http: httpx.Client,
    state: State,
    now: datetime,
) -> None:
    seen = set()
    for namespace in config.namespaces:
        exporter = destinations.for_namespace(namespace)
        if exporter is None:
            logger.debug(f"No OTLP traces endpoint configured for namespace {namespace}")
            continue
        workflows = custom.list_namespaced_custom_object(
            WORKFLOW_GROUP, WORKFLOW_VERSION, namespace, WORKFLOW_PLURAL
        )
        for workflow in workflows.get("items") or []:
            uid = workflow["metadata"]["uid"]
            seen.add(uid)
            if uid in state.done:
                continue
            if uid not in state.exported and _finished_before_lookback(
                workflow.get("status") or {}, now, config.lookback_seconds
            ):
                state.done.add(uid)
                continue
            try:
                export_workflow(http, config, exporter, state, workflow)
            except httpx.HTTPError as e:
                logger.warning(f"Could not read workflow run {workflow['metadata']['name']} from ark-api: {e}")
    state.prune(seen)


def _exit_on_signal(signum, frame) -> None:
    logger.info(f"Received signal {signum}, exiting")
    sys.exit(0)


def main() -> None:
    signal.signal(signal.SIGTERM, _exit_on_signal)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config()
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()
    destinations = Destinations(client.CoreV1Api(), config)
    custom = client.CustomObjectsApi()
    state = State()
    logger.info(f"Watching namespaces {config.namespaces}, polling every {config.poll_interval_seconds}s")
    with httpx.Client(timeout=ARK_API_TIMEOUT_SECONDS) as http:
        while True:
            run_once(config, custom, destinations, http, state, datetime.now(UTC))
            time.sleep(config.poll_interval_seconds)


if __name__ == "__main__":
    main()
