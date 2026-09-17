import base64
import hashlib
import re
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import yaml

SAMPLES_DIR = Path(__file__).resolve().parents[4] / "samples"

YAML_SUFFIXES = (".yaml", ".yml")
IGNORED_DIRECTORIES = ("venv", ".venv", "node_modules")

ARK_API_VERSION = "ark.mckinsey.com/v1alpha1"
CORE_API_VERSION = "v1"

# Chainsaw resolves ($binding) expressions at run time; outside chainsaw the
# document is not a valid manifest.
CHAINSAW_BINDING_MARKER = "($"
CHAINSAW_SKIP_REASON = "chainsaw bindings; validated when chainsaw runs it"

# spec.builtin.name is declared in the Tool API (ark/api/v1alpha1/tool_types.go:46-53)
# and documented as "Name of the Builtin being referenced", but nothing reads it:
# validation and executor resolution both switch on metadata.name instead
# (ark/internal/validation/tool.go:30, ark/executors/completions/agent_tools.go:94-101).
# A builtin Tool is therefore only valid when its object name is literally noop
# or terminate, so these three cannot be applied until the operator reads the field.
BUILTIN_NAME_SKIP_REASON = (
    "spec.builtin.name is declared in the Tool API but read by nothing, so a "
    "builtin Tool is only valid when metadata.name is literally noop or terminate"
)
SAMPLES_BLOCKED_BY_BUILTIN_NAME = (
    "tools/delete-database.yaml",
    "tools/deploy-application.yaml",
    "tools/get-deployment-status.yaml",
)

# Not Kubernetes manifests: chainsaw owns its Test files, kustomize owns
# kustomization.yaml.
NON_MANIFEST_API_GROUPS = ("chainsaw.kyverno.io/", "kustomize.config.k8s.io/")

# A namespace may not be set on these, and none of them is referenced by a
# sample that needs it to exist, so they are only ever dry-run.
CLUSTER_SCOPED_KINDS = ("ClusterRole", "ClusterRoleBinding", "Namespace")

# Only kinds that another document may need to exist are created for real, in
# this order. Every other kind is server-dry-run, so no Query ever executes, no
# Deployment is scheduled and no cluster-scoped object outlives the test.
REAL_CREATE_KINDS = ("Secret", "ConfigMap", "Model", "Tool", "MCPServer", "Agent", "Team")

# Anything a stub is built from. Sharing these with ENVSUBST_VALUES below keeps
# one definition of "a URL that passes validation" and "a model that exists".
STUB_VALUE = "stub"
STUB_VALUE_BASE64 = base64.b64encode(STUB_VALUE.encode()).decode()
STUB_BASE_URL = "https://models.example.com/v1"
STUB_TOOL_URL = "https://tools.example.com"
STUB_MODEL_VERSION = "gpt-4o"
STUB_AGENT_NAME = "stub-agent"
DEFAULT_PROVIDER = "openai"

# Values are chosen so the substituted document is admissible: MODEL_TYPE lands
# on an enum, BASE_URL must be https, and the API keys land in Secret.data,
# which must be valid base64.
ENVSUBST_VALUES = {
    "ANTHROPIC_API_KEY": STUB_VALUE_BASE64,
    "API_KEY": STUB_VALUE_BASE64,
    "API_VERSION": "2024-12-01-preview",
    "BASE_URL": STUB_BASE_URL,
    "GEMINI_API_KEY": STUB_VALUE_BASE64,
    "MODEL_TYPE": DEFAULT_PROVIDER,
    "MODEL_VERSION": STUB_MODEL_VERSION,
}

# scripts/quickstart.sh:194-196 uses default-model.yaml only for azure and
# openai-model.yaml for every other provider, and config.azure is the only one
# with an apiVersion field, so MODEL_TYPE cannot be global.
ENVSUBST_OVERRIDES = {"quickstart/default-model.yaml": {"MODEL_TYPE": "azure"}}

TARGET_TYPE_KINDS = {"agent": "Agent", "team": "Team", "model": "Model", "tool": "Tool"}

# (kind, the ref field that names one, the field its keys are written to).
# Secret uses stringData so no base64 handling is needed.
CORE_STUB_FIELDS = (
    ("Secret", "secretKeyRef", "stringData"),
    ("ConfigMap", "configMapKeyRef", "data"),
)

# Iteration order is load-bearing: a stub Team references a member Agent, and
# Team validation checks that the member exists.
STUB_SPECS = {
    "Model": {
        "provider": DEFAULT_PROVIDER,
        "model": {"value": STUB_MODEL_VERSION},
        "config": {
            DEFAULT_PROVIDER: {
                "apiKey": {"value": STUB_VALUE},
                "baseUrl": {"value": STUB_BASE_URL},
            }
        },
    },
    "Tool": {"type": "http", "http": {"url": STUB_TOOL_URL}},
    "Agent": {"prompt": STUB_VALUE},
    "Team": {
        "strategy": "sequential",
        "members": [{"name": STUB_AGENT_NAME, "type": "agent"}],
    },
}

PLACEHOLDER_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")

NAMESPACE_PREFIX = "s-"
MAX_NAMESPACE_LENGTH = 63  # DNS-1123 label limit
NAMESPACE_DIGEST_LENGTH = 6

REF_RETRY_ATTEMPTS = 20
REF_RETRY_DELAY_SECONDS = 0.5
KUBECTL_TIMEOUT_SECONDS = 120


def sample_files() -> List[str]:
    """Every sample YAML on disk, so a newly added sample is picked up with no
    registration. venv is skipped: samples/a2a/simple-agent carries one."""
    paths = []
    for path in sorted(SAMPLES_DIR.rglob("*")):
        if path.suffix not in YAML_SUFFIXES or not path.is_file():
            continue
        if any(part in IGNORED_DIRECTORIES for part in path.parts):
            continue
        paths.append(str(path.relative_to(SAMPLES_DIR)))
    return paths


def skip_reason(rel_path: str) -> Optional[str]:
    """Why a sample is not validated against the API, or None if it is."""
    if CHAINSAW_BINDING_MARKER in (SAMPLES_DIR / rel_path).read_text():
        return CHAINSAW_SKIP_REASON
    if rel_path in SAMPLES_BLOCKED_BY_BUILTIN_NAME:
        return BUILTIN_NAME_SKIP_REASON
    return None


class SamplesHelper:
    def __init__(self, namespace_helper):
        self.namespace_helper = namespace_helper

    def namespace_for(self, rel_path: str) -> str:
        slug = rel_path.lower()
        for suffix in YAML_SUFFIXES:
            if slug.endswith(suffix):
                slug = slug[: -len(suffix)]
                break

        name = NAMESPACE_PREFIX + NON_ALPHANUMERIC.sub("-", slug).strip("-")
        if len(name) > MAX_NAMESPACE_LENGTH:
            digest = hashlib.sha256(rel_path.encode()).hexdigest()[:NAMESPACE_DIGEST_LENGTH]
            kept = MAX_NAMESPACE_LENGTH - NAMESPACE_DIGEST_LENGTH - 1
            name = name[:kept].strip("-") + "-" + digest
        return name

    def substitute_placeholders(self, raw: str, rel_path: str) -> str:
        values = {**ENVSUBST_VALUES, **ENVSUBST_OVERRIDES.get(rel_path, {})}

        def replace(match):
            name = match.group(1)
            if name not in values:
                raise AssertionError(
                    f"no substitution for ${{{name}}}; add it to ENVSUBST_VALUES"
                )
            return values[name]

        return PLACEHOLDER_PATTERN.sub(replace, raw)

    def load_manifests(self, text: str) -> List[dict]:
        docs = []
        for doc in yaml.safe_load_all(text):
            if not isinstance(doc, dict):
                continue
            api_version = doc.get("apiVersion", "")
            if not api_version or not doc.get("kind"):
                continue
            if api_version.startswith(NON_MANIFEST_API_GROUPS):
                continue
            docs.append(doc)
        return docs

    def collect_refs(self, docs: List[dict]) -> Tuple[Set[Tuple[str, str]], Dict[str, Dict[str, Set[str]]]]:
        ark_refs: Set[Tuple[str, str]] = set()
        core_keys: Dict[str, Dict[str, Set[str]]] = {kind: {} for kind, _, _ in CORE_STUB_FIELDS}

        for doc in docs:
            self._collect_ark_refs(doc, ark_refs)
            for node in self._walk_maps(doc):
                for kind, ref_field, _ in CORE_STUB_FIELDS:
                    self._collect_key_ref(node, ref_field, core_keys[kind])
        return ark_refs, core_keys

    def _collect_ark_refs(self, doc: dict, out: Set[Tuple[str, str]]) -> None:
        spec = doc.get("spec") or {}
        kind = doc.get("kind")
        if kind == "Query":
            self._add_target_ref(spec.get("target"), out)
        elif kind == "Team":
            for member in spec.get("members") or []:
                self._add_target_ref(member, out)
            selector_agent = (spec.get("selector") or {}).get("agent")
            if selector_agent:
                out.add(("Agent", selector_agent))

    def _add_target_ref(self, node, out: Set[Tuple[str, str]]) -> None:
        if not isinstance(node, dict):
            return
        kind = TARGET_TYPE_KINDS.get(node.get("type"))
        name = node.get("name")
        if kind and name:
            out.add((kind, name))

    def _collect_key_ref(self, node: dict, ref_field: str, out: Dict[str, Set[str]]) -> None:
        ref = node.get(ref_field)
        if not isinstance(ref, dict) or not ref.get("name"):
            return
        keys = out.setdefault(ref["name"], set())
        if ref.get("key"):
            keys.add(ref["key"])

    def _walk_maps(self, value):
        if isinstance(value, dict):
            yield value
            for child in value.values():
                yield from self._walk_maps(child)
        elif isinstance(value, list):
            for child in value:
                yield from self._walk_maps(child)

    def build_stubs(self, docs: List[dict], namespace: str) -> List[dict]:
        """A sample may reference an Agent, Model, Secret or ConfigMap that no
        sample defines (query-with-timeout.yaml targets data-analyst). The
        webhooks check those against live objects, so a minimal stand-in is
        created."""
        defined = {
            (doc["kind"], doc["metadata"]["name"])
            for doc in docs
            if doc.get("metadata", {}).get("name")
        }
        ark_refs, core_keys = self.collect_refs(docs)
        stubs = []

        for kind, _, data_field in CORE_STUB_FIELDS:
            for name, keys in sorted(core_keys[kind].items()):
                if (kind, name) not in defined:
                    stubs.append(self._core_stub(kind, name, namespace, keys, data_field))

        needs_team = any(ref not in defined for ref in ark_refs if ref[0] == "Team")
        if needs_team and ("Agent", STUB_AGENT_NAME) not in defined:
            stubs.append(self._ark_stub("Agent", STUB_AGENT_NAME, namespace))
            defined.add(("Agent", STUB_AGENT_NAME))

        for stub_kind in STUB_SPECS:
            for ref_kind, ref_name in sorted(ark_refs):
                if ref_kind == stub_kind and (ref_kind, ref_name) not in defined:
                    stubs.append(self._ark_stub(ref_kind, ref_name, namespace))
                    defined.add((ref_kind, ref_name))
        return stubs

    def _core_stub(self, kind: str, name: str, namespace: str, keys: Set[str], data_field: str) -> dict:
        return {
            "apiVersion": CORE_API_VERSION,
            "kind": kind,
            "metadata": {"name": name, "namespace": namespace},
            data_field: {key: STUB_VALUE for key in sorted(keys)},
        }

    def _ark_stub(self, kind: str, name: str, namespace: str) -> dict:
        return {
            "apiVersion": ARK_API_VERSION,
            "kind": kind,
            "metadata": {"name": name, "namespace": namespace},
            "spec": STUB_SPECS[kind],
        }

    def apply(self, docs: List[dict], namespace: str, dry_run: bool) -> Tuple[bool, str]:
        if not docs:
            return True, ""
        command = ["kubectl", "apply", "-n", namespace, "-f", "-"]
        if dry_run:
            command.append("--dry-run=server")

        # Webhook reads go through the controller's informer cache, so a
        # reference created moments earlier can still read as absent. Anything
        # that is not a missing reference fails immediately.
        for attempt in range(REF_RETRY_ATTEMPTS):
            result = subprocess.run(
                command,
                input=yaml.safe_dump_all(docs),
                capture_output=True,
                text=True,
                timeout=KUBECTL_TIMEOUT_SECONDS,
            )
            if result.returncode == 0:
                return True, result.stdout.strip()
            message = (result.stderr or result.stdout).strip()
            if "not found" not in message or attempt == REF_RETRY_ATTEMPTS - 1:
                return False, message
            time.sleep(REF_RETRY_DELAY_SECONDS)
        return False, "unreachable"

    def validate(self, rel_path: str) -> Tuple[bool, str]:
        raw = (SAMPLES_DIR / rel_path).read_text()
        docs = self.load_manifests(self.substitute_placeholders(raw, rel_path))
        if not docs:
            return True, "no Kubernetes manifests in file"

        namespace = self.namespace_for(rel_path)
        created, message = self.namespace_helper.create_namespace(namespace)
        if not created:
            return False, f"could not create namespace {namespace}: {message}"

        try:
            for doc in docs:
                if doc["kind"] not in CLUSTER_SCOPED_KINDS:
                    doc.setdefault("metadata", {})["namespace"] = namespace

            ok, message = self.apply(self.build_stubs(docs, namespace), namespace, dry_run=False)
            if not ok:
                return False, f"stub creation failed: {message}"

            for kind in REAL_CREATE_KINDS:
                ok, message = self.apply([d for d in docs if d["kind"] == kind], namespace, dry_run=False)
                if not ok:
                    return False, message

            remaining = [d for d in docs if d["kind"] not in REAL_CREATE_KINDS]
            return self.apply(remaining, namespace, dry_run=True)
        finally:
            # Not NamespaceHelper.delete_namespace: that one blocks until the
            # namespace finalizes, which would dominate a 100-file sweep.
            subprocess.run(
                ["kubectl", "delete", "namespace", namespace, "--wait=false", "--ignore-not-found=true"],
                capture_output=True,
                text=True,
                timeout=KUBECTL_TIMEOUT_SECONDS,
            )
