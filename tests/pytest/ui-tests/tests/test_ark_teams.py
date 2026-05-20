import logging
import pytest
from playwright.sync_api import Page
from pages.agents_page import AgentsPage
from pages.teams_page import TeamsPage
from conftest import MOCK_LLM_MODEL_NAME


logger = logging.getLogger(__name__)


@pytest.fixture(scope="class")
def team_test_resources():
    return {
        "agents": {},
        "teams": {}
    }


@pytest.mark.teams
@pytest.mark.xdist_group("ark_teams")
class TestArkTeams:

    @pytest.mark.parametrize("prefix", [
        "team",
    ])
    def test_create_team_with_members(self, page: Page, prefix: str, team_test_resources: dict):
        agents = AgentsPage(page)
        teams = TeamsPage(page)

        team_data = teams.TEST_DATA["default"]

        agent_result = agents.create_agent_for_test("agent", MOCK_LLM_MODEL_NAME)
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"

        row_verification = agent_result["row_verification"]
        assert row_verification["row_found"], "Agent row should be found in table"
        assert row_verification["name_visible"], "Agent name should be visible in table row"

        team_test_resources["agents"][prefix] = agent_result['name']

        teams.navigate_to_teams_tab()
        if not teams.is_visible(teams.ADD_TEAM_BUTTON):
            pytest.skip("Add Team button not available")

        team_name = teams.generate_team_name("team")
        member_name = agent_result['name']

        logger.info(f"Creating team with newly created agent: {member_name}")

        team_result = teams.create_team_with_verification(
            team_name=team_name,
            description=team_data["description"],
            strategy=team_data["strategy"],
            max_turns=team_data["max_turns"],
            member_names=[member_name],
        )

        assert team_result["popup_visible"], "Team creation popup should be visible"
        assert team_result["in_table"], "Team should be visible in table"

        team_test_resources["teams"][prefix] = team_result['name']
        logger.info(f"Team created successfully: {team_result['name']}")

    @pytest.mark.parametrize("prefix", [
        "team",
    ])
    def test_delete_team(self, page: Page, prefix: str, team_test_resources: dict):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()

        team_name = team_test_resources["teams"].get(prefix)
        if not team_name:
            pytest.skip("Team was not created, skipping delete")
        result = teams.delete_team_with_verification(team_name)

        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")

        logger.info(f"Team deleted: {team_name}")
        if result["confirm_dialog_visible"]:
            logger.info("Confirm dialog verified")
        if result["confirm_button_visible"]:
            logger.info("Confirm button verified")

        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        agent_name = team_test_resources["agents"].get(prefix)
        agent_result = agents.delete_agent_with_verification(agent_name)
        if agent_result["delete_available"]:
            logger.info(f"Agent deleted: {agent_name}")
