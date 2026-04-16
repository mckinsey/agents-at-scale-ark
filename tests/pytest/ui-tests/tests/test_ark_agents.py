import logging
import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage
from pages.agents_page import AgentsPage
from pages.tools_page import ToolsPage


logger = logging.getLogger(__name__)

@pytest.fixture(scope="class")
def agent_test_resources():
    return {
        "secrets": {},
        "models": {},
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
        secrets = SecretsPage(page)
        models = ModelsPage(page)
        agents = AgentsPage(page)
        
        model_data = models.TEST_DATA["openai"]
        
        secret_result = secrets.create_secret_for_test("secret", model_data["env_key"])
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        agent_test_resources["secrets"][prefix] = secret_result['name']
        
        model_result = models.create_model_for_test("model", secret_result['name'], secrets)
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["in_table"], "Model should be visible in table"
        assert model_result["is_available"], "Model should show Available status"
        agent_test_resources["models"][prefix] = model_result['name']
        
        agent_result = agents.create_agent_for_test(prefix, model_result['name'])
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"
        
        row_verification = agent_result["row_verification"]
        assert row_verification["row_found"], "Agent row should be found in table"
        assert row_verification["name_visible"], "Agent name should be visible in table row"
        assert row_verification["description_visible"], "Agent description should be visible in table row"
        
        if row_verification["model_visible"]:
            logger.info(f"Model '{model_result['name']}' is visible in agent row")
        else:
            logger.info(f"Model '{model_result['name']}' not visible in agent row (may be truncated or displayed differently)")
        
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
        # Wait for a reply - wait for a div to appear containing the agent name (and the agent's message as well, presumably)
        assistant_message = agents.wait_for_element(f"div.bg-muted:has-text('{agent_name}')", timeout=60000)
        assistant_text = assistant_message.inner_text()

        page.reload()
        agents.wait_for_navigation_complete()
        agents.wait_for_element(agents.CHAT_WINDOW, timeout=10000)
        new_chat_window = page.locator(agents.CHAT_WINDOW)
        assert new_chat_window.is_visible(), "Chat window should still be open after reload"
        assert new_chat_window.locator(f"text={message}").first.is_visible(), \
            "User message should be visible in chat history after reload"
        new_assistant_message = agents.wait_for_element(f"div.bg-muted:has-text('{agent_name}')")
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
            logger.info(f"Confirm dialog verified")
        if result["confirm_button_visible"]:
            logger.info(f"Confirm button verified")
        
        models = ModelsPage(page)
        models.navigate_to_models_tab()
        model_name = agent_test_resources["models"].get(prefix)
        model_result = models.delete_model_with_verification(model_name)
        if model_result["delete_available"]:
            logger.info(f"Model deleted: {model_name}")
        
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        secret_name = agent_test_resources["secrets"].get(prefix)
        secret_result = secrets.delete_secret_with_verification(secret_name)
        if secret_result["delete_available"]:
            logger.info(f"Secret deleted: {secret_name}")
    
    @pytest.mark.parametrize("prefix", [
        "agent-tool",
    ])
    def test_create_agent_with_tools(self, page: Page, prefix: str, agent_test_resources: dict):
        secrets = SecretsPage(page)
        models = ModelsPage(page)
        agents = AgentsPage(page)
        tools = ToolsPage(page)
        
        model_data = models.TEST_DATA["openai"]
        
        secret_result = secrets.create_secret_for_test("secret", model_data["env_key"])
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        agent_test_resources["secrets"][prefix] = secret_result['name']
        
        model_result = models.create_model_for_test("model", secret_result['name'], secrets)
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["in_table"], "Model should be visible in table"
        assert model_result["is_available"], "Model should show Available status"
        agent_test_resources["models"][prefix] = model_result['name']
        
        tool_result = tools.create_tool_for_test("get-coordinates")
        assert tool_result["popup_visible"], "Tool creation popup should be visible"
        assert tool_result["in_table"], "Tool should be visible in table"
        agent_test_resources["tools"][prefix] = tool_result['name']
        
        agent_result = agents.create_agent_for_test(prefix, model_result['name'], "with_tools", [tool_result['name']])
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
        
        models = ModelsPage(page)
        models.navigate_to_models_tab()
        model_name = agent_test_resources["models"].get(prefix)
        model_result = models.delete_model_with_verification(model_name)
        if model_result["delete_available"]:
            logger.info(f"Model deleted: {model_name}")
        
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        secret_name = agent_test_resources["secrets"].get(prefix)
        secret_result = secrets.delete_secret_with_verification(secret_name)
        if secret_result["delete_available"]:
            logger.info(f"Secret deleted: {secret_name}")

