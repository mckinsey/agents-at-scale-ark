"""Human-in-the-loop tool approval journeys in the dashboard.

Unlike the rest of this suite these tests need a real OpenAI-compatible
endpoint. An approval card only appears once an agent emits a tool call; the
executor always streams model calls for a top-level query, and mock-llm drops
tool_calls from a streamed response, so it cannot drive the approval gate.

Export CICD_OPENAI_API_KEY (or E2E_TEST_OPENAI_API_KEY) plus the matching base
URL to run them, or deselect them with ``-m 'not llm'``.
"""

import os
from pathlib import Path
from string import Template

import pytest
from playwright.sync_api import Page

from conftest import get_resource, list_resources, wait_for_resource
from helpers.k8s import apply_yaml, delete_resource
from pages.a2a_tasks_page import A2ATasksPage
from pages.hitl_approvals_page import HitlApprovalsPage
from pages.sessions_page import SessionsPage

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"
MODEL_FIXTURE = FIXTURES_DIR / "hitl-gateway-model.yaml"
AGENTS_FIXTURE = FIXTURES_DIR / "hitl-approval-agents.yaml"

MODEL_NAME = "hitl-gateway-model"
APPROVAL_AGENT = "hitl-approval-agent"
EXPIRING_AGENT = "hitl-expiring-agent"
PROTECTED_TOOL = "hitl-protected-action"
HITL_AGENTS = (APPROVAL_AGENT, EXPIRING_AGENT)

ROLLOUT_REQUEST = "Roll out version v2.1.0 to the production environment."

PHASE_INPUT_REQUIRED = "input-required"
PHASE_DONE = "done"
TASK_PHASE_COMPLETED = "completed"
TASK_PHASE_FAILED = "failed"

# Long enough for the executor to reach a real model and come back.
QUERY_SETTLE_TIMEOUT_S = 180


def _phase_reached(kind: str, name: str, phase: str, timeout_s: int = 120) -> tuple[bool, str]:
    """Watch a resource until status.phase reaches the wanted value."""
    return wait_for_resource(
        kind, name, "jsonpath={.status.phase}=" + phase, timeout_s=timeout_s
    )


def _approval_task_name(query: dict) -> str:
    """The A2ATask the dashboard drives an approval through, per the query."""
    response = (query.get("status") or {}).get("response") or {}
    task_id = (response.get("a2a") or {}).get("taskId") or ""
    assert task_id, (
        f"query {query['metadata']['name']} carries no A2A task id, so no approval "
        f"was raised; status was {query.get('status')}"
    )
    return f"a2a-task-{task_id}"


def _query_for_session(session_id: str) -> dict:
    """The most recent query the dashboard created for a session."""
    matching = [
        query
        for query in list_resources("queries")
        if (query.get("spec") or {}).get("sessionId") == session_id
    ]
    assert matching, f"no query was created for session {session_id}"
    return max(matching, key=lambda query: query["metadata"]["creationTimestamp"])


def _completed_condition(task: dict) -> dict:
    conditions = (task.get("status") or {}).get("conditions") or []
    completed = [
        condition for condition in conditions if condition.get("type") == "Completed"
    ]
    assert completed, (
        f"task {task['metadata']['name']} has no Completed condition; "
        f"conditions were {conditions}"
    )
    return completed[0]


def _start_rollout_conversation(page: Page, agent_name: str) -> str:
    """Open a conversation with an agent and ask for a rollout. Returns the session id."""
    sessions = SessionsPage(page)
    sessions.navigate_to_session_history()
    session_id = sessions.create_new_session(agent_name, participant_tab="Agents")
    assert session_id, f"no session was created for {agent_name}"

    sessions.wait_for_session_detail_page()
    sessions.click_conversations_tab()
    sessions.send_message_in_conversation(ROLLOUT_REQUEST)
    return session_id


@pytest.fixture(scope="module")
def hitl_agents(ark_setup):
    """Install the approval-gated tool, the gateway model and the HITL agents."""
    api_key = os.environ.get("CICD_OPENAI_API_KEY") or os.environ.get(
        "E2E_TEST_OPENAI_API_KEY"
    )
    base_url = os.environ.get("CICD_OPENAI_BASE_URL") or os.environ.get(
        "E2E_TEST_OPENAI_BASE_URL"
    )
    if not api_key or not base_url:
        pytest.fail(
            "HITL journeys need a real LLM endpoint. Set CICD_OPENAI_API_KEY (or "
            "E2E_TEST_OPENAI_API_KEY) and CICD_OPENAI_BASE_URL (or "
            "E2E_TEST_OPENAI_BASE_URL), or deselect these tests with -m 'not llm'."
        )

    model_manifest = Template(MODEL_FIXTURE.read_text()).substitute(
        HITL_MODEL_API_KEY=api_key,
        HITL_MODEL_BASE_URL=base_url,
        HITL_MODEL_NAME=os.environ.get("E2E_TEST_OPENAI_MODEL", "gpt-4.1-mini"),
    )
    applied, message = apply_yaml(model_manifest)
    assert applied, f"could not create the HITL model: {message}"

    available, message = wait_for_resource(
        "model", MODEL_NAME, "condition=ModelAvailable"
    )
    assert available, f"HITL model never became available: {message}"

    applied, message = apply_yaml(AGENTS_FIXTURE.read_text())
    assert applied, f"could not create the HITL agents: {message}"

    yield

    for query in list_resources("queries"):
        target = ((query.get("spec") or {}).get("target") or {}).get("name")
        if target in HITL_AGENTS:
            delete_resource("query", query["metadata"]["name"])
    for agent in HITL_AGENTS:
        delete_resource("agent", agent)
    delete_resource("tool", PROTECTED_TOOL)
    delete_resource("model", MODEL_NAME)
    delete_resource("secret", "hitl-gateway-token")


@pytest.mark.hitl
@pytest.mark.llm
@pytest.mark.xdist_group("ark_hitl")
class TestHitlApprovalJourneys:
    """The four things a human can do with an approval-gated tool call."""

    def test_pending_tool_call_is_shown_with_its_arguments(
        self, page: Page, hitl_agents
    ):
        approvals = HitlApprovalsPage(page)
        session_id = _start_rollout_conversation(page, APPROVAL_AGENT)

        approvals.wait_for_approval_request()
        requested = approvals.get_requested_tool_names()
        assert requested == [PROTECTED_TOOL], (
            f"the approval card should name the tool that is waiting, but showed {requested}"
        )

        arguments = approvals.get_tool_input()
        assert '"target"' in arguments and '"version"' in arguments, (
            f"the card should show the pending call's arguments, but showed {arguments!r}"
        )
        assert "v2.1.0" in arguments, (
            f"the card should show the version that was asked for, but showed {arguments!r}"
        )

        query = _query_for_session(session_id)
        assert query["status"]["phase"] == PHASE_INPUT_REQUIRED, (
            "the query should be parked awaiting input, but was in phase "
            f"{query['status']['phase']}"
        )
        task = get_resource("a2atask", _approval_task_name(query))
        assert task["status"]["phase"] == PHASE_INPUT_REQUIRED, (
            "the approval task should be awaiting input, but was in phase "
            f"{task['status']['phase']}"
        )

    def test_approving_runs_the_tool_and_finishes_the_query(
        self, page: Page, hitl_agents
    ):
        approvals = HitlApprovalsPage(page)
        session_id = _start_rollout_conversation(page, APPROVAL_AGENT)

        approvals.wait_for_approval_request()
        query = _query_for_session(session_id)
        task_name = _approval_task_name(query)

        approvals.approve()
        assert approvals.wait_for_decision_recorded(), (
            "the card should stop offering a decision once one is submitted"
        )

        granted, message = _phase_reached("a2atask", task_name, TASK_PHASE_COMPLETED)
        assert granted, f"approval task never completed after approving: {message}"

        condition = _completed_condition(get_resource("a2atask", task_name))
        assert condition["reason"] == "ApprovalGranted", (
            f"approving should record ApprovalGranted, got {condition['reason']}"
        )

        finished, message = _phase_reached(
            "query", query["metadata"]["name"], PHASE_DONE, QUERY_SETTLE_TIMEOUT_S
        )
        assert finished, f"query never finished after the tool was approved: {message}"

    def test_rejecting_blocks_the_tool_but_still_answers(
        self, page: Page, hitl_agents
    ):
        approvals = HitlApprovalsPage(page)
        session_id = _start_rollout_conversation(page, APPROVAL_AGENT)

        approvals.wait_for_approval_request()
        query = _query_for_session(session_id)
        task_name = _approval_task_name(query)

        approvals.reject()
        assert approvals.wait_for_decision_recorded(), (
            "the card should stop offering a decision once one is submitted"
        )

        refused, message = _phase_reached("a2atask", task_name, TASK_PHASE_FAILED)
        assert refused, f"approval task never failed after rejecting: {message}"

        task = get_resource("a2atask", task_name)
        condition = _completed_condition(task)
        assert condition["reason"] == "ApprovalRejected", (
            f"rejecting should record ApprovalRejected, got {condition['reason']}"
        )
        assert task["status"]["error"] == "Tool execution rejected by user", (
            "the rejection should be recorded against the task, but the error was "
            f"{task['status'].get('error')!r}"
        )

        # A rejection is handed back to the agent as a tool error rather than
        # failing the query, so the human still gets an answer.
        finished, message = _phase_reached(
            "query", query["metadata"]["name"], PHASE_DONE, QUERY_SETTLE_TIMEOUT_S
        )
        assert finished, f"query never answered after the tool was rejected: {message}"

    def test_unanswered_approval_expires_and_withdraws_the_decision(
        self, page: Page, hitl_agents
    ):
        approvals = HitlApprovalsPage(page)
        session_id = _start_rollout_conversation(page, EXPIRING_AGENT)

        approvals.wait_for_approval_request()
        assert approvals.is_decision_offered(), (
            "a live approval should offer both Approve and Reject"
        )

        query = _query_for_session(session_id)
        task_name = _approval_task_name(query)

        assert approvals.wait_for_expiry_notice(), (
            "an approval left unanswered should tell the human it expired"
        )
        assert not approvals.is_decision_offered(), (
            "an expired approval must not still offer a decision"
        )

        lapsed, message = _phase_reached("a2atask", task_name, TASK_PHASE_FAILED)
        assert lapsed, f"approval task never failed after the window closed: {message}"

        condition = _completed_condition(get_resource("a2atask", task_name))
        assert condition["reason"] == "ApprovalTimeoutRejected", (
            "letting the window close should record ApprovalTimeoutRejected, got "
            f"{condition['reason']}"
        )

    def test_pending_approval_is_listed_on_the_tasks_page(
        self, page: Page, hitl_agents
    ):
        approvals = HitlApprovalsPage(page)
        tasks = A2ATasksPage(page)
        session_id = _start_rollout_conversation(page, APPROVAL_AGENT)

        approvals.wait_for_approval_request()
        task_name = _approval_task_name(_query_for_session(session_id))

        tasks.navigate_to_tasks_tab()
        status = tasks.wait_for_task_status(task_name, "Input required")
        assert status == "Input required", (
            f"the tasks page should list {task_name} as awaiting input, but showed "
            f"{status!r}"
        )
