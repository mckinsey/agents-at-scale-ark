import logging
import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage
from pages.agents_page import AgentsPage
from pages.teams_page import TeamsPage
from pages.sessions_page import SessionsPage


logger = logging.getLogger(__name__)


@pytest.fixture(scope="class")
def sessions_test_resources():
    return {
        "secrets": {},
        "models": {},
        "agents": {},
        "teams": {},
        "sessions": {},
    }


@pytest.mark.sessions
@pytest.mark.xdist_group("ark_sessions")
class TestSessionsAndConversations:

    def _create_base_resources(self, page: Page, resources: dict, prefix: str) -> dict:
        secrets = SecretsPage(page)
        models = ModelsPage(page)

        model_data = models.TEST_DATA["openai"]

        secret_result = secrets.create_secret_for_test("secret", model_data["env_key"])
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        resources["secrets"][prefix] = secret_result["name"]

        model_result = models.create_model_for_test("model", secret_result["name"], secrets)
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["in_table"], "Model should be visible in table"
        assert model_result["is_available"], "Model should show Available status"
        resources["models"][prefix] = model_result["name"]

        return {"secret": secret_result, "model": model_result}

    # -------------------------------------------------------------------------
    # Resource setup
    # -------------------------------------------------------------------------

    def test_setup_agent_resources(self, page: Page, sessions_test_resources: dict):
        base = self._create_base_resources(page, sessions_test_resources, "agent")

        agents = AgentsPage(page)
        agent_result = agents.create_agent_for_test("session-agent", base["model"]["name"])
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"
        sessions_test_resources["agents"]["primary"] = agent_result["name"]
        logger.info("Created primary agent: %s", agent_result["name"])

    def test_setup_multi_agent_team_resources(self, page: Page, sessions_test_resources: dict):
        if not sessions_test_resources["models"].get("agent"):
            pytest.skip("Base model not created, skipping team setup")

        model_name = sessions_test_resources["models"]["agent"]
        agents = AgentsPage(page)
        teams = TeamsPage(page)

        agent2_result = agents.create_agent_for_test("session-agent2", model_name)
        assert agent2_result["popup_visible"], "Second agent creation popup should be visible"
        assert agent2_result["in_table"], "Second agent should be visible in table"
        sessions_test_resources["agents"]["secondary"] = agent2_result["name"]

        teams.navigate_to_teams_tab()
        if not teams.is_visible(teams.ADD_TEAM_BUTTON):
            pytest.skip("Add Team button not available")

        team_data = teams.TEST_DATA["default"]
        team_name = teams.generate_team_name("session-team")
        primary_agent = sessions_test_resources["agents"]["primary"]
        secondary_agent = sessions_test_resources["agents"]["secondary"]

        team_result = teams.create_team_with_verification(
            team_name=team_name,
            description=team_data["description"],
            strategy=team_data["strategy"],
            max_turns=team_data["max_turns"],
            member_name=primary_agent,
            additional_members=[secondary_agent],
        )
        assert team_result["popup_visible"], "Team creation popup should be visible"
        assert team_result["in_table"], "Team should be visible in table"
        sessions_test_resources["teams"]["multi_agent"] = team_result["name"]
        logger.info("Created multi-agent team: %s with members %s, %s", team_name, primary_agent, secondary_agent)

    # -------------------------------------------------------------------------
    # Agent session: create + conversation flow
    # -------------------------------------------------------------------------

    def test_create_agent_session(self, page: Page, sessions_test_resources: dict):
        agent_name = sessions_test_resources["agents"].get("primary")
        if not agent_name:
            pytest.skip("Primary agent not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        session_id = sessions.create_new_session(agent_name, participant_tab="Agents")
        assert session_id, "Session ID should be extracted from URL"
        assert "/sessions/" in page.url, "Should be redirected to session detail page"
        sessions_test_resources["sessions"]["agent"] = session_id

        sessions.wait_for_session_detail_page()
        assert sessions.is_visible(sessions.HISTORY_TAB), "History tab should be visible"
        assert sessions.is_participant_shown_in_header(agent_name), \
            f"Agent '{agent_name}' should appear as participant in header"

    def test_agent_session_conversation_flow(self, page: Page, sessions_test_resources: dict):
        agent_name = sessions_test_resources["agents"].get("primary")
        if not agent_name:
            pytest.skip("Primary agent not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        session_id = sessions.create_new_session(agent_name, participant_tab="Agents")
        assert session_id, "Session should be created for conversation flow"
        sessions_test_resources["sessions"]["agent"] = session_id

        sessions.wait_for_session_detail_page()
        sessions.click_conversations_tab()

        assert sessions.is_visible(sessions.CHAT_TEXTAREA, timeout=10000), \
            "Chat textarea should be visible"

        initial_count = sessions.get_assistant_message_count()
        sessions.send_message_in_conversation("What is 2 + 2? Please give a brief answer.")
        assert sessions.get_user_message_count() >= 1, "User message should appear after sending"

        assert sessions.wait_for_assistant_response(initial_count, timeout_s=120), \
            "Agent should respond within timeout"

        assert sessions.wait_for_conversation_in_sidebar(agent_name, timeout_s=30), \
            f"Conversation with '{agent_name}' should appear in sidebar"
        assert sessions.get_sidebar_conversation_count() >= 1, \
            "At least one conversation should be in the sidebar"

        page.reload()
        sessions.wait_for_navigation_complete()
        sessions.click_conversations_tab()
        assert sessions.get_sidebar_conversation_count() >= 1, \
            "Conversation count should persist after page reload"

        sessions.navigate_back_to_sessions()
        assert sessions.is_session_in_table(session_id, retries=5), \
            f"Agent session {session_id} should appear in the sessions list"

    # -------------------------------------------------------------------------
    # Team session: create + conversation flow (multi-agent)
    # -------------------------------------------------------------------------

    def test_create_team_session(self, page: Page, sessions_test_resources: dict):
        team_name = sessions_test_resources["teams"].get("multi_agent")
        if not team_name:
            pytest.skip("Multi-agent team not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        session_id = sessions.create_new_session(team_name, participant_tab="Teams")
        assert session_id, "Session ID should be extracted from URL"
        assert "/sessions/" in page.url, "Should be redirected to team session detail page"
        sessions_test_resources["sessions"]["team"] = session_id

        sessions.wait_for_session_detail_page()
        assert sessions.is_participant_shown_in_header(team_name), \
            f"Team '{team_name}' should appear as participant in header"
        assert sessions.get_participants_count_from_header() >= 1, \
            "At least one participant should be shown in session header"

    def test_team_session_conversation_flow(self, page: Page, sessions_test_resources: dict):
        team_name = sessions_test_resources["teams"].get("multi_agent")
        if not team_name:
            pytest.skip("Multi-agent team not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        session_id = sessions.create_new_session(team_name, participant_tab="Teams")
        assert session_id, "Team session should be created for conversation flow"
        sessions_test_resources["sessions"]["team"] = session_id

        sessions.wait_for_session_detail_page()
        sessions.click_conversations_tab()

        assert sessions.is_visible(sessions.CHAT_TEXTAREA, timeout=10000), \
            "Chat textarea should be visible for team conversation"

        initial_count = sessions.get_assistant_message_count()
        sessions.send_message_in_conversation("Hello, what is the capital of France?")
        assert sessions.get_user_message_count() >= 1, "User message should appear after sending"

        assert sessions.wait_for_assistant_response(initial_count, timeout_s=120), \
            "Team should respond within timeout"

        assert sessions.wait_for_conversation_in_sidebar(team_name, timeout_s=30), \
            f"Conversation with team '{team_name}' should appear in sidebar"
        assert sessions.get_sidebar_conversation_count() >= 1, \
            "At least one conversation should be in the team session sidebar"

        page.reload()
        sessions.wait_for_navigation_complete()
        sessions.click_conversations_tab()
        assert sessions.get_sidebar_conversation_count() >= 1, \
            "Team conversation count should persist after page reload"

        sessions.navigate_back_to_sessions()
        assert sessions.is_session_in_table(session_id, retries=5), \
            f"Team session {session_id} should appear in the sessions list"
        assert sessions.get_stats_total_session_count() >= 1, \
            "Sessions stats bar should show at least 1 session"

    # -------------------------------------------------------------------------
    # Cleanup
    # -------------------------------------------------------------------------

    def test_cleanup_sessions_resources(self, page: Page, sessions_test_resources: dict):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        team_name = sessions_test_resources["teams"].get("multi_agent")
        if team_name:
            result = teams.delete_team_with_verification(team_name)
            if result["delete_available"]:
                logger.info("Deleted team: %s", team_name)

        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        for key in ("secondary", "primary"):
            agent_name = sessions_test_resources["agents"].get(key)
            if agent_name:
                result = agents.delete_agent_with_verification(agent_name)
                if result["delete_available"]:
                    logger.info("Deleted agent: %s", agent_name)

        models = ModelsPage(page)
        models.navigate_to_models_tab()
        model_name = sessions_test_resources["models"].get("agent")
        if model_name:
            result = models.delete_model_with_verification(model_name)
            if result["delete_available"]:
                logger.info("Deleted model: %s", model_name)

        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        secret_name = sessions_test_resources["secrets"].get("agent")
        if secret_name:
            result = secrets.delete_secret_with_verification(secret_name)
            if result["delete_available"]:
                logger.info("Deleted secret: %s", secret_name)
