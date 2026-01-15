import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage
from pages.agents_page import AgentsPage
from pages.teams_page import TeamsPage


@pytest.mark.teams
class TestArkTeams:
    created_secrets = {}
    created_models = {}
    created_agents = {}
    created_teams = {}
    
    @pytest.mark.parametrize("prefix", [
        "team",
    ])
    @pytest.mark.dependency(name="create_team_team")
    def test_create_team_with_members(self, page: Page, prefix: str):
        secrets = SecretsPage(page)
        models = ModelsPage(page)
        agents = AgentsPage(page)
        teams = TeamsPage(page)
        
        team_data = teams.TEST_DATA["default"]
        model_data = models.TEST_DATA["openai"]
        
        secret_result = secrets.create_secret_for_test("secret", model_data["env_key"])
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        TestArkTeams.created_secrets[prefix] = secret_result['name']
        
        model_result = models.create_model_for_test("model", secret_result['name'], secrets)
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["in_table"], "Model should be visible in table"
        assert model_result["is_available"], "Model should show Available status"
        TestArkTeams.created_models[prefix] = model_result['name']
        
        agent_result = agents.create_agent_for_test("agent", model_result['name'])
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"
        
        row_verification = agent_result["row_verification"]
        assert row_verification["row_found"], "Agent row should be found in table"
        assert row_verification["name_visible"], "Agent name should be visible in table row"
        
        TestArkTeams.created_agents[prefix] = agent_result['name']
        
        teams.navigate_to_teams_tab()
        
        if not teams.is_visible(teams.ADD_TEAM_BUTTON):
            pytest.skip("Add Team button not available")
        
        team_name = teams.generate_team_name("team")
        member_name = agent_result['name']
        
        print(f"Creating team with newly created agent: {member_name}")
        
        team_result = teams.create_team_with_verification(
            team_name=team_name,
            description=team_data["description"],
            strategy=team_data["strategy"],
            max_turns=team_data["max_turns"],
            member_name=member_name
        )
        
        assert team_result["popup_visible"], "Team creation popup should be visible"
        assert team_result["in_table"], "Team should be visible in table"
        
        TestArkTeams.created_teams[prefix] = team_result['name']
        print(f"Team created successfully: {team_result['name']}")
        print(f"Description: {team_data['description']}")
        print(f"Strategy: {team_data['strategy']}")
        print(f"Max turns: {team_data['max_turns']}")
        print(f"Team member: {member_name}")
    
    @pytest.mark.parametrize("prefix", [
        "team",
    ])
    @pytest.mark.dependency(depends=["create_team_team"])
    def test_delete_team(self, page: Page, prefix: str):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        
        team_name = TestArkTeams.created_teams.get(prefix)
        result = teams.delete_team_with_verification(team_name)
        
        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")
        
        print(f"Team deleted: {team_name}")
        if result["confirm_dialog_visible"]:
            print(f"Confirm dialog verified")
        if result["confirm_button_visible"]:
            print(f"Confirm button verified")
        
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        agent_name = TestArkTeams.created_agents.get(prefix)
        agent_result = agents.delete_agent_with_verification(agent_name)
        if agent_result["delete_available"]:
            print(f"Agent deleted: {agent_name}")
        
        models = ModelsPage(page)
        models.navigate_to_models_tab()
        model_name = TestArkTeams.created_models.get(prefix)
        model_result = models.delete_model_with_verification(model_name)
        if model_result["delete_available"]:
            print(f"Model deleted: {model_name}")
        
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        secret_name = TestArkTeams.created_secrets.get(prefix)
        secret_result = secrets.delete_secret_with_verification(secret_name)
        if secret_result["delete_available"]:
            print(f"Secret deleted: {secret_name}")

