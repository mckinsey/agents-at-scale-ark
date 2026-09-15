"""Shared lookups for Ark resources that tests read back from the cluster."""

from shared.k8s import DEFAULT_NAMESPACE, list_resources


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
