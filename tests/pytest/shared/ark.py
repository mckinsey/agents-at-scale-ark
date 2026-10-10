"""Shared lookups for Ark resources that tests read back from the cluster."""

import json
from typing import NamedTuple
from uuid import uuid4

from shared.k8s import DEFAULT_NAMESPACE, apply_yaml, list_resources

QUERY_MANIFEST = """\
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: {name}
  namespace: {namespace}
spec:
  type: user
  input: {input}
  target:
    name: {target}
    type: {target_type}
  sessionId: {session_id}
  conversationId: {conversation_id}
"""


class SeededQuery(NamedTuple):
    """A query created directly in the cluster, and where to find it."""

    name: str
    session_id: str
    conversation_id: str


def submit_query(
    target: str,
    user_input: str,
    target_type: str = "agent",
    session_id: str | None = None,
    conversation_id: str | None = None,
    namespace: str = DEFAULT_NAMESPACE,
) -> SeededQuery:
    """Create a Query straight in the cluster, bypassing the dashboard.

    The Sessions view is read-only, so tests seed the conversation through the
    API and use the UI only to observe it.
    """
    suffix = uuid4().hex[:8]
    seeded = SeededQuery(
        name=f"ui-query-{suffix}",
        session_id=session_id or f"ui-session-{suffix}",
        conversation_id=conversation_id or f"ui-conv-{suffix}",
    )
    applied, message = apply_yaml(
        QUERY_MANIFEST.format(
            name=seeded.name,
            namespace=namespace,
            input=json.dumps(user_input),
            target=json.dumps(target),
            target_type=json.dumps(target_type),
            session_id=json.dumps(seeded.session_id),
            conversation_id=json.dumps(seeded.conversation_id),
        )
    )
    assert applied, f"could not submit a query to {target}: {message}"
    return seeded


def query_for_session(session_id: str, namespace: str = DEFAULT_NAMESPACE) -> dict:
    """The most recent query created for a session."""
    matching = [
        query
        for query in list_resources("queries", namespace)
        if (query.get("spec") or {}).get("sessionId") == session_id
    ]
    assert matching, f"no query was created for session {session_id}"
    return max(matching, key=lambda query: query["metadata"]["creationTimestamp"])


def a2a_task_name(query: dict) -> str:
    """The A2ATask raised for a query, named after the task id in its response."""
    response = (query.get("status") or {}).get("response") or {}
    task_id = (response.get("a2a") or {}).get("taskId") or ""
    assert task_id, (
        f"query {query['metadata']['name']} carries no A2A task id, so no approval "
        f"was raised; status was {query.get('status')}"
    )
    return f"a2a-task-{task_id}"
