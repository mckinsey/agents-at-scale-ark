import json
import logging
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect
from pages.agents_page import AgentsPage
from pages.tools_page import ToolsPage
from conftest import MOCK_LLM_MODEL_NAME


logger = logging.getLogger(__name__)

@pytest.fixture(scope="class")
def agent_test_resources():
    return {
        "agents": {},
        "tools": {}
    }


@pytest.mark.agents
@pytest.mark.xdist_group("ark_agents")
class TestArkAgents:

    @pytest.mark.parametrize("prefix", [
        "agent",
    ])
    def test_create_agent_with_model(self, page: Page, prefix: str, agent_test_resources: dict):
        agents = AgentsPage(page)

        agent_result = agents.create_agent_for_test(prefix, MOCK_LLM_MODEL_NAME)
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"

        row_verification = agent_result["row_verification"]
        assert row_verification["row_found"], "Agent row should be found in table"
        assert row_verification["name_visible"], "Agent name should be visible in table row"
        assert row_verification["description_visible"], "Agent description should be visible in table row"

        agent_test_resources["agents"][prefix] = agent_result['name']

    def test_chat_window_opens_from_agent_row(self, page: Page, agent_test_resources: dict):
        agent_name = agent_test_resources["agents"].get("agent")
        if not agent_name:
            pytest.skip("Agent was not created, skipping chat test")
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        agents.open_agent_chat(agent_name)

        assert page.locator(agents.CHAT_WINDOW).first.is_visible(), \
            "Floating chat window should be open"
        agents.close_agent_chat()

    def test_empty_chat_window_persists_after_page_reload(self, page: Page, agent_test_resources: dict):
        agent_name = agent_test_resources["agents"].get("agent")
        if not agent_name:
            pytest.skip("Agent was not created, skipping chat test")
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        agents.open_agent_chat(agent_name)

        page.reload()
        agents.wait_for_navigation_complete()
        agents.wait_for_element(agents.CHAT_WINDOW, timeout=10000)
        assert page.locator(agents.CHAT_WINDOW).first.is_visible(), \
            "Floating chat window should still be visible after page reload"
        agents.close_agent_chat()

    def test_chat_history_persists_after_page_reload(self, page: Page, agent_test_resources: dict):
        message = "Hello from persistence test"

        agent_name = agent_test_resources["agents"].get("agent")
        if not agent_name:
            pytest.skip("Agent was not created, skipping chat test")
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        agents.open_agent_chat(agent_name)

        chat_window = page.locator(agents.CHAT_WINDOW)
        chat_input = chat_window.locator("input")
        chat_input.fill(message)
        chat_input.press("Enter")
        # Use the input placeholder text to determine when the agent response is done processing
        expect(chat_input).to_have_attribute("placeholder", "Processing...", timeout=5000)
        expect(chat_input).not_to_have_attribute("placeholder", "Processing...", timeout=90000)
        assistant_message = chat_window.locator("div.bg-muted").last
        expect(assistant_message).to_contain_text(agent_name, timeout=5000)
        assistant_text = assistant_message.inner_text()

        page.reload()
        agents.wait_for_navigation_complete()
        agents.wait_for_element(agents.CHAT_WINDOW, timeout=10000)
        new_chat_window = page.locator(agents.CHAT_WINDOW)
        assert new_chat_window.is_visible(), "Chat window should still be open after reload"
        assert new_chat_window.locator(f"text={message}").first.is_visible(), \
            "User message should be visible in chat history after reload"
        new_assistant_message = new_chat_window.locator("div.bg-muted").last
        new_assistant_message.wait_for(state="visible", timeout=15000)
        assert new_assistant_message.inner_text() == assistant_text, "Assistant messages should be visible in chat after reload"
        agents.close_agent_chat()

    def test_chat_window_closed_does_not_reopen_after_reload(self, page: Page, agent_test_resources: dict):
        agent_name = agent_test_resources["agents"].get("agent")
        if not agent_name:
            pytest.skip("Agent was not created, skipping chat test")
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        agents.wait_for_element(f"p.truncate.text-sm.font-medium:has-text('{agent_name}')", timeout=15000)
        agents.open_agent_chat(agent_name)
        agents.close_agent_chat()

        page.reload()
        agents.wait_for_navigation_complete()
        assert not agents.is_visible(agents.CHAT_WINDOW, timeout=3000), \
            "Chat window should not reopen after being closed and page reloaded"

    @pytest.mark.parametrize("prefix", [
        "agent",
    ])
    def test_delete_agent(self, page: Page, prefix: str, agent_test_resources: dict):
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()

        agent_name = agent_test_resources["agents"].get(prefix)
        if not agent_name:
            pytest.skip("Agent was not created, skipping delete")
        result = agents.delete_agent_with_verification(agent_name)

        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")

        logger.info(f"Agent deleted: {agent_name}")
        if result["confirm_dialog_visible"]:
            logger.info("Confirm dialog verified")
        if result["confirm_button_visible"]:
            logger.info("Confirm button verified")

    @pytest.mark.parametrize("prefix", [
        "agent-tool",
    ])
    def test_create_agent_with_tools(self, page: Page, prefix: str, agent_test_resources: dict):
        agents = AgentsPage(page)
        tools = ToolsPage(page)

        tool_result = tools.create_tool_for_test("get-coordinates")
        try:
            assert tool_result["popup_visible"], "Tool creation popup should be visible"
            assert tool_result["in_table"], "Tool should be visible in table"
        except AssertionError:
            _dump_tool_creation_diagnostics(page, tool_result)
            raise
        agent_test_resources["tools"][prefix] = tool_result['name']

        agent_result = agents.create_agent_for_test(prefix, MOCK_LLM_MODEL_NAME, "with_tools", [tool_result['name']])
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"

        row_verification = agent_result["row_verification"]
        assert row_verification["row_found"], "Agent row should be found in table"
        assert row_verification["name_visible"], "Agent name should be visible in table row"
        assert row_verification["description_visible"], "Agent description should be visible in table row"

        agent_test_resources["agents"][prefix] = agent_result['name']

    @pytest.mark.parametrize("prefix", [
        "agent-tool",
    ])
    def test_delete_agent_with_tools(self, page: Page, prefix: str, agent_test_resources: dict):
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()

        agent_name = agent_test_resources["agents"].get(prefix)
        if not agent_name:
            pytest.skip("Agent was not created, skipping delete")
        result = agents.delete_agent_with_verification(agent_name)

        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")

        logger.info(f"Agent deleted: {agent_name}")

        tools = ToolsPage(page)
        tools.navigate_to_tools_tab()
        tool_name = agent_test_resources["tools"].get(prefix)
        tool_result = tools.delete_tool_with_verification(tool_name)
        if tool_result["delete_available"]:
            logger.info(f"Tool deleted: {tool_name}")


def _dump_tool_creation_diagnostics(page: Page, tool_result: dict) -> None:
    """On tool-creation popup failure, capture URL, tool_result flags, dialog
    state, console errors, and the current /api/v1/tools list. Written to
    the screenshots dir so it rides along with the ui-test-screenshots artifact."""
    screenshots_dir = getattr(page, "_screenshots_dir", Path("screenshots"))
    path = Path(screenshots_dir) / "test_create_agent_with_tools.diagnostics.txt"

    lines = [
        f"URL: {page.url}",
        f"tool_result: {tool_result}",
        "",
    ]

    console_messages = getattr(page, "_test_console_messages", []) or []
    lines.append(f"Console messages ({len(console_messages)}, last 30):")
    for m in console_messages[-30:]:
        lines.append(f"  [{m.get('type')}] {m.get('text', '')[:500]}")
    lines.append("")

    try:
        dialog = page.locator("[role='dialog'], [data-slot='dialog-content']").first
        if dialog.count() > 0 and dialog.is_visible(timeout=1000):
            lines.append("Dialog still open at failure time.")
            lines.append("--- dialog innerText (truncated to 4kB) ---")
            lines.append(dialog.inner_text()[:4000])
            errs = page.locator("[role='dialog'] [role='alert'], [role='dialog'] .text-destructive").all_inner_texts()
            if errs:
                lines.append(f"Field validation errors: {errs}")
        else:
            lines.append("Dialog not present in DOM at failure time (closed or never opened).")
    except Exception as e:
        lines.append(f"dialog probe failed: {e}")
    lines.append("")

    try:
        result = page.evaluate(
            """async () => {
                const r = await fetch('/api/v1/tools');
                return { status: r.status, body: await r.text() };
            }"""
        )
        body = result.get("body", "")
        try:
            body = json.dumps(json.loads(body), indent=2)
        except Exception:
            pass
        lines.append(f"GET /api/v1/tools -> {result.get('status')}")
        lines.append(body[:8000])
    except Exception as e:
        lines.append(f"tools list fetch failed: {e}")

    try:
        path.write_text("\n".join(lines))
        logger.info("tool creation diagnostics saved: %s", path)
    except Exception as e:
        logger.error("failed to write tool creation diagnostics: %s", e)
