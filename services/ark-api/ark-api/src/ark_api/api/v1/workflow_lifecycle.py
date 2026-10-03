"""Pure Kubernetes-native CR mutations for Argo Workflow lifecycle actions.

These functions replicate the field changes that the argo-server / argo CLI
apply, but expressed as mutations on the Workflow custom resource dict so they
can run through the generic dynamic client. They are pure: they take a workflow
dict and return the mutated object (plus, for retry, the node IDs whose pods
must be deleted), performing no I/O.
"""
from copy import deepcopy
from datetime import datetime, timezone
from typing import Optional

LABEL_COMPLETED = "workflows.argoproj.io/completed"
LABEL_ARCHIVING_STATUS = "workflows.argoproj.io/workflow-archiving-status"
LABEL_PHASE = "workflows.argoproj.io/phase"
LABEL_RESUBMITTED_FROM = "workflows.argoproj.io/resubmitted-from-workflow"
LABEL_CREATOR = "workflows.argoproj.io/creator"
LABEL_CREATOR_EMAIL = "workflows.argoproj.io/creator-email"
LABEL_CREATOR_PREFERRED_USERNAME = "workflows.argoproj.io/creator-preferred-username"

RESUBMIT_SKIP_LABELS = frozenset({
    LABEL_CREATOR,
    LABEL_CREATOR_EMAIL,
    LABEL_CREATOR_PREFERRED_USERNAME,
    LABEL_PHASE,
    LABEL_COMPLETED,
    LABEL_ARCHIVING_STATUS,
})

GROUP_NODE_TYPES = frozenset({"DAG", "TaskGroup", "StepGroup", "Steps"})
COMPLETED_PHASES = frozenset({"Succeeded", "Failed", "Error"})
RETRYABLE_PHASES = frozenset({"Failed", "Error"})
RESET_NODE_PHASES = frozenset({"Error", "Failed", "Omitted"})
KEEP_NODE_PHASES = frozenset({"Succeeded", "Skipped"})


class LifecyclePreconditionError(ValueError):
    """Raised when a workflow is not in a state that permits the requested action."""


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _descendant_node_ids(node_id: str, nodes: dict) -> list[str]:
    descendants: list[str] = []
    queue = list((nodes.get(node_id) or {}).get("children") or [])
    seen: set[str] = set()
    while queue:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.add(current)
        descendants.append(current)
        queue.extend((nodes.get(current) or {}).get("children") or [])
    return descendants


def _is_descendant_node_succeeded(node: dict, nodes: dict, seen: set[str]) -> bool:
    for child_id in node.get("children") or []:
        if child_id in seen:
            continue
        seen.add(child_id)
        child = nodes.get(child_id)
        if child is None:
            continue
        if child.get("phase") == "Succeeded":
            return True
        if _is_descendant_node_succeeded(child, nodes, seen):
            return True
    return False


def _reset_node(node: dict, now: str) -> dict:
    reset = deepcopy(node)
    if reset.get("type") == "Suspend" and reset.get("outputs"):
        for parameter in reset["outputs"].get("parameters") or []:
            parameter["value"] = None
            parameter["valueFrom"] = {"supplied": {}}
    if reset.get("phase") != "Skipped":
        reset["phase"] = "Running"
    reset["message"] = ""
    reset["startedAt"] = now
    reset["finishedAt"] = None
    return reset


def _upsert_completed_condition(status: dict) -> None:
    conditions = status.get("conditions") or []
    for condition in conditions:
        if condition.get("type") == "Completed":
            condition["status"] = "False"
            status["conditions"] = conditions
            return
    conditions.append({"type": "Completed", "status": "False"})
    status["conditions"] = conditions


def formulate_retry_workflow(workflow: dict) -> tuple[dict, list[str]]:
    """Reset a Failed/Error workflow to re-run from the point of failure.

    Returns the mutated workflow (to be written back with a full replace) and
    the list of node IDs whose pods must be deleted. Implements the simple
    retry: successful work is kept, failed leaf nodes and their pods are
    dropped, failed group nodes are reset so the controller re-enters them.
    """
    status = workflow.get("status") or {}
    phase = status.get("phase")
    if phase not in RETRYABLE_PHASES:
        raise LifecyclePreconditionError(f"Cannot retry a workflow in phase {phase or 'Unknown'}")

    old_nodes = status.get("nodes") or {}
    for node_id, node in old_nodes.items():
        node_phase = node.get("phase")
        if node_phase not in KEEP_NODE_PHASES and node_phase not in RESET_NODE_PHASES:
            raise LifecyclePreconditionError(
                f"Workflow cannot be retried with node {node_id} in {node_phase or 'Unknown'} phase"
            )

    new_workflow = deepcopy(workflow)
    metadata = new_workflow.setdefault("metadata", {})
    labels = metadata.get("labels") or {}
    labels.pop(LABEL_COMPLETED, None)
    labels.pop(LABEL_ARCHIVING_STATUS, None)
    labels[LABEL_PHASE] = "Running"
    metadata["labels"] = labels

    now = _now_rfc3339()
    new_status = new_workflow.setdefault("status", {})
    _upsert_completed_condition(new_status)
    new_status["phase"] = "Running"
    new_status["message"] = ""
    new_status["startedAt"] = now
    new_status["finishedAt"] = None
    new_status["persistentVolumeClaims"] = []

    spec = new_workflow.setdefault("spec", {})
    spec.pop("shutdown", None)
    if isinstance(new_status.get("storedWorkflowSpec"), dict):
        new_status["storedWorkflowSpec"].pop("shutdown", None)
    if spec.get("activeDeadlineSeconds") == 0:
        spec["activeDeadlineSeconds"] = None

    onexit_name = f"{metadata.get('name', '')}.onExit"
    new_nodes: dict = {}
    deleted: set[str] = set()
    pods_to_delete: list[str] = []

    def _drop_subtree(root_id: str, root_node: dict) -> None:
        deleted.add(root_id)
        if root_node.get("type") == "Pod":
            pods_to_delete.append(root_id)
        for descendant_id in _descendant_node_ids(root_id, old_nodes):
            deleted.add(descendant_id)
            if (old_nodes.get(descendant_id) or {}).get("type") == "Pod":
                pods_to_delete.append(descendant_id)

    for node_id, node in old_nodes.items():
        node_phase = node.get("phase")
        node_type = node.get("type")

        if node_phase in KEEP_NODE_PHASES:
            if node.get("name") == onexit_name:
                _drop_subtree(node_id, node)
            else:
                new_nodes[node_id] = deepcopy(node)
            continue

        if node_type in GROUP_NODE_TYPES:
            new_nodes[node_id] = _reset_node(node, now)
            continue

        if node_type != "Retry" and _is_descendant_node_succeeded(node, old_nodes, set()):
            new_nodes[node_id] = deepcopy(node)
            continue

        deleted.add(node_id)
        if node_type == "Pod":
            pods_to_delete.append(node_id)

    for node_id in deleted:
        new_nodes.pop(node_id, None)

    for node in new_nodes.values():
        if node.get("children"):
            node["children"] = [child for child in node["children"] if child not in deleted]
        if node.get("outboundNodes"):
            node["outboundNodes"] = [child for child in node["outboundNodes"] if child not in deleted]

    new_status["nodes"] = new_nodes
    return new_workflow, pods_to_delete


def formulate_resume_workflow(workflow: dict) -> dict:
    """Clear a whole-workflow suspend and resolve active suspend-node gates.

    Mirrors ``argo resume`` without a node selector: removes ``spec.suspend``
    and marks every active Suspend node Succeeded, resolving supplied output
    parameter defaults. Written back with a full replace.
    """
    new_workflow = deepcopy(workflow)
    spec = new_workflow.setdefault("spec", {})
    spec.pop("suspend", None)

    now = _now_rfc3339()
    nodes = (new_workflow.get("status") or {}).get("nodes") or {}
    for node in nodes.values():
        if node.get("type") != "Suspend" or node.get("phase") != "Running":
            continue
        outputs = node.get("outputs") or {}
        for parameter in outputs.get("parameters") or []:
            value_from = parameter.get("valueFrom") or {}
            if "default" in value_from:
                parameter["value"] = value_from["default"]
                parameter["valueFrom"] = None
            elif parameter.get("value") is None:
                raise LifecyclePreconditionError(
                    f"output parameter '{parameter.get('name')}' has not been set and does not have a default value"
                )
        node["phase"] = "Succeeded"
        node["finishedAt"] = now
    return new_workflow


def formulate_resubmit_workflow(workflow: dict) -> dict:
    """Build a fresh Workflow object from an existing one's spec.

    Mirrors ``argo resubmit`` without memoization: a new object with no status
    and no name (server assigns one from generateName), labelled with the
    source workflow name. To be written with a create.
    """
    metadata = workflow.get("metadata") or {}
    source_name = metadata.get("name", "")

    new_metadata: dict = {}
    generate_name = metadata.get("generateName")
    new_metadata["generateName"] = generate_name if generate_name else f"{source_name}-"

    labels = {
        key: value
        for key, value in (metadata.get("labels") or {}).items()
        if key not in RESUBMIT_SKIP_LABELS
    }
    labels[LABEL_RESUBMITTED_FROM] = source_name
    new_metadata["labels"] = labels

    if metadata.get("annotations"):
        new_metadata["annotations"] = deepcopy(metadata["annotations"])
    if metadata.get("ownerReferences"):
        new_metadata["ownerReferences"] = deepcopy(metadata["ownerReferences"])

    spec = deepcopy(workflow.get("spec") or {})
    spec.pop("shutdown", None)
    if spec.get("activeDeadlineSeconds") == 0:
        spec["activeDeadlineSeconds"] = None

    return {
        "apiVersion": workflow.get("apiVersion", "argoproj.io/v1alpha1"),
        "kind": workflow.get("kind", "Workflow"),
        "metadata": new_metadata,
        "spec": spec,
    }


def validate_suspendable(workflow: dict) -> None:
    phase = (workflow.get("status") or {}).get("phase")
    if phase in COMPLETED_PHASES:
        raise LifecyclePreconditionError(f"Cannot suspend a completed workflow (phase {phase})")


def validate_stoppable(workflow: dict) -> None:
    phase = (workflow.get("status") or {}).get("phase")
    if phase is not None and phase in COMPLETED_PHASES:
        raise LifecyclePreconditionError(f"Cannot shut down a completed workflow (phase {phase})")


def workflow_pod_suffix(node_id: str) -> Optional[str]:
    """The trailing hash segment shared by a node ID and its pod name."""
    _, _, suffix = node_id.rpartition("-")
    return suffix or None
