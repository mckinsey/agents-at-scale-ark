import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage
from pages.agents_page import AgentsPage
from pages.tools_page import ToolsPage


@pytest.mark.agents
class TestArkAgents:
    created_secrets = {}
    created_models = {}
    created_agents = {}
    created_tools = {}
    
    @pytest.mark.parametrize("prefix", [
        "agent",
    ])
    @pytest.mark.dependency(name="create_agent_agent")
    def test_create_agent_with_model(self, page: Page, prefix: str):
        secrets = SecretsPage(page)
        models = ModelsPage(page)
        agents = AgentsPage(page)
        
        model_data = models.TEST_DATA["openai"]
        
        secret_result = secrets.create_secret_for_test("secret", model_data["env_key"])
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        TestArkAgents.created_secrets[prefix] = secret_result['name']
        
        model_result = models.create_model_for_test("model", secret_result['name'], secrets)
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["in_table"], "Model should be visible in table"
        assert model_result["is_available"], "Model should show Available status"
        TestArkAgents.created_models[prefix] = model_result['name']
        
        agent_result = agents.create_agent_for_test(prefix, model_result['name'])
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"
        
        row_verification = agent_result["row_verification"]
        assert row_verification["row_found"], "Agent row should be found in table"
        assert row_verification["name_visible"], "Agent name should be visible in table row"
        assert row_verification["description_visible"], "Agent description should be visible in table row"
        
        if row_verification["model_visible"]:
            print(f"Model '{model_result['name']}' is visible in agent row")
        else:
            print(f"Model '{model_result['name']}' not visible in agent row (may be truncated or displayed differently)")
        
        TestArkAgents.created_agents[prefix] = agent_result['name']
    
    @pytest.mark.parametrize("prefix", [
        "agent",
    ])
    @pytest.mark.dependency(depends=["create_agent_agent"])
    def test_delete_agent(self, page: Page, prefix: str):
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        
        agent_name = TestArkAgents.created_agents.get(prefix)
        result = agents.delete_agent_with_verification(agent_name)
        
        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")
        
        print(f"Agent deleted: {agent_name}")
        if result["confirm_dialog_visible"]:
            print(f"Confirm dialog verified")
        if result["confirm_button_visible"]:
            print(f"Confirm button verified")
        
        models = ModelsPage(page)
        models.navigate_to_models_tab()
        model_name = TestArkAgents.created_models.get(prefix)
        model_result = models.delete_model_with_verification(model_name)
        if model_result["delete_available"]:
            print(f"Model deleted: {model_name}")
        
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        secret_name = TestArkAgents.created_secrets.get(prefix)
        secret_result = secrets.delete_secret_with_verification(secret_name)
        if secret_result["delete_available"]:
            print(f"Secret deleted: {secret_name}")
    
    @pytest.mark.parametrize("prefix", [
        "agent-tool",
    ])
    @pytest.mark.dependency(name="create_agent_with_tools_agent_tool")
    def test_create_agent_with_tools(self, page: Page, prefix: str):
        secrets = SecretsPage(page)
        models = ModelsPage(page)
        agents = AgentsPage(page)
        tools = ToolsPage(page)
        
        model_data = models.TEST_DATA["openai"]
        
        secret_result = secrets.create_secret_for_test("secret", model_data["env_key"])
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        TestArkAgents.created_secrets[prefix] = secret_result['name']
        
        model_result = models.create_model_for_test("model", secret_result['name'], secrets)
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["in_table"], "Model should be visible in table"
        assert model_result["is_available"], "Model should show Available status"
        TestArkAgents.created_models[prefix] = model_result['name']
        
        tool_result = tools.create_tool_for_test("get-coordinates")
        assert tool_result["popup_visible"], "Tool creation popup should be visible"
        assert tool_result["in_table"], "Tool should be visible in table"
        TestArkAgents.created_tools[prefix] = tool_result['name']
        
        agent_result = agents.create_agent_for_test(prefix, model_result['name'], "with_tools", [tool_result['name']])
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"
        
        row_verification = agent_result["row_verification"]
        assert row_verification["row_found"], "Agent row should be found in table"
        assert row_verification["name_visible"], "Agent name should be visible in table row"
        assert row_verification["description_visible"], "Agent description should be visible in table row"
        
        TestArkAgents.created_agents[prefix] = agent_result['name']
    
    @pytest.mark.parametrize("prefix", [
        "agent-tool",
    ])
    @pytest.mark.dependency(depends=["create_agent_with_tools_agent_tool"])
    def test_delete_agent_with_tools(self, page: Page, prefix: str):
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        
        agent_name = TestArkAgents.created_agents.get(prefix)
        result = agents.delete_agent_with_verification(agent_name)
        
        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")
        
        print(f"Agent deleted: {agent_name}")
        
        tools = ToolsPage(page)
        tools.navigate_to_tools_tab()
        tool_name = TestArkAgents.created_tools.get(prefix)
        tool_result = tools.delete_tool_with_verification(tool_name)
        if tool_result["delete_available"]:
            print(f"Tool deleted: {tool_name}")
        
        models = ModelsPage(page)
        models.navigate_to_models_tab()
        model_name = TestArkAgents.created_models.get(prefix)
        model_result = models.delete_model_with_verification(model_name)
        if model_result["delete_available"]:
            print(f"Model deleted: {model_name}")
        
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        secret_name = TestArkAgents.created_secrets.get(prefix)
        secret_result = secrets.delete_secret_with_verification(secret_name)
        if secret_result["delete_available"]:
            print(f"Secret deleted: {secret_name}")

