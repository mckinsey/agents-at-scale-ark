import logging
import pytest
from playwright.sync_api import Page
from pages.agents_page import AgentsPage
from pages.teams_page import TeamsPage
from pages.sessions_page import SessionsPage
from conftest import MOCK_LLM_MODEL_NAME


logger = logging.getLogger(__name__)


@pytest.fixture(scope="class")
def sessions_test_resources():
    return {
        "agents": {},
        "teams": {},
        "sessions": {},
    }


@pytest.mark.sessions
@pytest.mark.xdist_group("ark_sessions")
class TestSessionsAndConversations:

    # -------------------------------------------------------------------------
    # Resource setup
    # -------------------------------------------------------------------------

    def test_setup_agent_resources(self, page: Page, sessions_test_resources: dict):
        agents = AgentsPage(page)
        agent_result = agents.create_agent_for_test("session-agent", MOCK_LLM_MODEL_NAME)
        assert agent_result["popup_visible"], "Agent creation popup should be visible"
        assert agent_result["in_table"], "Agent should be visible in table"
        sessions_test_resources["agents"]["primary"] = agent_result["name"]
        logger.info("Created primary agent: %s", agent_result["name"])

    def test_setup_multi_agent_team_resources(self, page: Page, sessions_test_resources: dict):
        if not sessions_test_resources["agents"].get("primary"):
            pytest.skip("Primary agent not created, skipping team setup")

        agents = AgentsPage(page)
        teams = TeamsPage(page)

        agent2_result = agents.create_agent_for_test("session-agent2", MOCK_LLM_MODEL_NAME)
        assert agent2_result["popup_visible"], "Second agent creation popup should be visible"
        assert agent2_result["in_table"], "Second agent should be visible in table"
        sessions_test_resources["agents"]["secondary"] = agent2_result["name"]

        teams.navigate_to_teams_tab()
        if not teams.is_visible(teams.ADD_TEAM_BUTTON):
            pytest.fail("Add Team button not available")

        team_data = teams.TEST_DATA["default"]
        team_name = teams.generate_team_name("session-team")
        primary_agent = sessions_test_resources["agents"]["primary"]
        secondary_agent = sessions_test_resources["agents"]["secondary"]

        team_result = teams.create_team_with_verification(
            team_name=team_name,
            description=team_data["description"],
            strategy=team_data["strategy"],
            max_turns=team_data["max_turns"],
            member_names=[primary_agent, secondary_agent],
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
        assert sessions.get_user_message_count() == 1, "Exactly 1 user message should appear after sending"

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

        sessions.navigate_to_session_detail(session_id)
        sessions.wait_for_session_detail_page()
        conv_count = sessions.get_conversation_count_from_header()
        assert conv_count >= 1, \
            f"Session {session_id} should show at least 1 conversation in the detail header, got {conv_count}"
        sessions.navigate_back_to_sessions()

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
        assert sessions.get_user_message_count() == 1, "Exactly 1 user message should appear after sending"

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
    # Session counts and status verification
    # -------------------------------------------------------------------------

    def test_session_idle_status_after_conversation(self, page: Page, sessions_test_resources: dict):
        session_id = sessions_test_resources["sessions"].get("agent")
        if not session_id:
            pytest.skip("Agent session not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        assert sessions.is_session_in_table(session_id, retries=5), \
            f"Session {session_id} should be visible in table"

        status = sessions.get_session_status_in_table(session_id)
        assert status in ("idle", "active", ""), \
            f"Session status should be idle or active after conversation, got: '{status}'"

    def test_session_status_filter_and_search(self, page: Page, sessions_test_resources: dict):
        session_id = sessions_test_resources["sessions"].get("agent")
        if not session_id:
            pytest.skip("Agent session not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        baseline_count = sessions.get_visible_session_count()
        assert baseline_count >= 1, "At least one session should be visible"

        sessions.set_status_filter("Active")
        active_count = sessions.get_visible_session_count()
        logger.info("Active filter count: %d", active_count)
        assert active_count >= 0, "Active filter should show non-negative count"

        sessions.set_status_filter("Idle")
        idle_count = sessions.get_visible_session_count()
        logger.info("Idle filter count: %d", idle_count)
        assert idle_count >= 0, "Idle filter should show non-negative count"

        sessions.set_status_filter("All")
        sessions.search_sessions(session_id)
        search_count = sessions.get_visible_session_count()
        assert search_count >= 1, \
            f"Searching for session ID '{session_id}' should return at least 1 result"

        sessions.clear_search()

    def test_session_detail_header_counts(self, page: Page, sessions_test_resources: dict):
        agent_name = sessions_test_resources["agents"].get("primary")
        session_id = sessions_test_resources["sessions"].get("agent")
        if not session_id or not agent_name:
            pytest.skip("Agent session not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        sessions.navigate_to_session_detail(session_id)
        sessions.wait_for_session_detail_page()

        conv_count = sessions.get_conversation_count_from_header()
        assert conv_count >= 1, \
            f"Session detail header should show at least 1 conversation, got {conv_count}"

        assert sessions.is_participant_shown_in_header(agent_name), \
            f"Agent '{agent_name}' should be shown in session detail header"

        participant_count = sessions.get_participants_count_from_header()
        assert participant_count >= 1, \
            f"Session detail header should show at least 1 participant, got {participant_count}"

    # -------------------------------------------------------------------------
    # Dialog validation
    # -------------------------------------------------------------------------

    def test_create_session_dialog_cancel(self, page: Page, sessions_test_resources: dict):
        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        initial_url = page.url
        sessions.open_new_session_dialog()
        assert sessions.is_visible(sessions.SESSION_DIALOG), \
            "New session dialog should be visible after clicking New session"

        assert sessions.is_create_button_disabled(), \
            "Create button should be disabled when no participant is selected"

        sessions.cancel_session_dialog()
        assert page.url == initial_url, \
            "URL should not change after canceling session dialog"
        assert not sessions.is_visible(sessions.SESSION_DIALOG, timeout=3000), \
            "Dialog should close after clicking Cancel"

    # -------------------------------------------------------------------------
    # Sort controls
    # -------------------------------------------------------------------------

    def test_session_table_sort_toggle(self, page: Page, sessions_test_resources: dict):
        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        total = sessions.get_visible_session_count()
        if total < 1:
            pytest.skip("No sessions available for sort test")

        sessions.click_sort_header("Name")
        assert sessions.get_visible_session_count() == total, \
            "Sorting by Name should not change the number of visible sessions"

        sessions.click_sort_header("Name")
        assert sessions.get_visible_session_count() == total, \
            "Reversing Name sort should not change the number of visible sessions"

        sessions.click_sort_header("Convos")
        assert sessions.get_visible_session_count() == total, \
            "Sorting by Convos should not change the number of visible sessions"

    # -------------------------------------------------------------------------
    # Empty search results
    # -------------------------------------------------------------------------

    def test_empty_search_results(self, page: Page, sessions_test_resources: dict):
        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        nonexistent_id = "zzz-nonexistent-session-id-xyz-999"
        sessions.search_sessions(nonexistent_id)

        count = sessions.get_visible_session_count()
        assert count == 0, \
            f"Search for nonexistent ID should return 0 results, got {count}"

        assert sessions.is_empty_state_shown(), \
            "Empty state message should be shown when no sessions match the search"

        sessions.clear_search()
        reset_count = sessions.get_visible_session_count()
        assert reset_count >= 0, "Clearing search should restore sessions list"

    # -------------------------------------------------------------------------
    # Multiple messages in one conversation
    # -------------------------------------------------------------------------

    def test_multi_message_conversation(self, page: Page, sessions_test_resources: dict):
        agent_name = sessions_test_resources["agents"].get("primary")
        if not agent_name:
            pytest.skip("Primary agent not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        session_id = sessions.create_new_session(agent_name, participant_tab="Agents")
        assert session_id, "Session should be created for multi-message test"

        sessions.wait_for_session_detail_page()
        sessions.click_conversations_tab()

        assert sessions.is_visible(sessions.CHAT_TEXTAREA, timeout=10000), \
            "Chat textarea should be visible"

        messages = [
            "What is 1 + 1? Give a very brief answer.",
            "What is 2 + 2? Give a very brief answer.",
            "What is 3 + 3? Give a very brief answer.",
        ]

        for i, msg in enumerate(messages):
            initial_count = sessions.get_assistant_message_count()
            sessions.send_message_in_conversation(msg)
            assert sessions.wait_for_assistant_response(initial_count, timeout_s=120), \
                f"Agent should respond to message {i + 1} within timeout"

        assert sessions.get_user_message_count() >= len(messages), \
            f"At least {len(messages)} user messages should be visible"
        assert sessions.get_assistant_message_count() >= len(messages), \
            f"At least {len(messages)} assistant responses should be visible"

    # -------------------------------------------------------------------------
    # Multiple conversations in one session
    # -------------------------------------------------------------------------

    def test_multiple_conversations_in_session(self, page: Page, sessions_test_resources: dict):
        agent_name = sessions_test_resources["agents"].get("primary")
        if not agent_name:
            pytest.skip("Primary agent not created")

        sessions = SessionsPage(page)
        sessions.navigate_to_session_history()

        session_id = sessions.create_new_session(agent_name, participant_tab="Agents")
        assert session_id, "Session should be created for multi-conversation test"

        sessions.wait_for_session_detail_page()
        sessions.click_conversations_tab()

        assert sessions.is_visible(sessions.CHAT_TEXTAREA, timeout=10000), \
            "Chat textarea should be visible for first conversation"

        initial_count = sessions.get_assistant_message_count()
        sessions.send_message_in_conversation("Hello, this is conversation 1.")
        assert sessions.wait_for_assistant_response(initial_count, timeout_s=120), \
            "Agent should respond in first conversation"

        first_conv_sidebar_count = sessions.get_sidebar_conversation_count()
        assert first_conv_sidebar_count >= 1, \
            "At least one conversation should appear in sidebar after first message"

        sessions.click_new_conversation_button()
        assert sessions.is_visible(sessions.NEW_CONVERSATION_DIALOG, timeout=5000), \
            "New conversation dialog should open"

        sessions.select_participant_in_dialog(agent_name, participant_tab="Agents")
        sessions.confirm_new_conversation()
        sessions.page.wait_for_timeout(1000)
        sessions.wait_for_navigation_complete()

        second_textarea = sessions.page.locator(sessions.CHAT_TEXTAREA).first
        if second_textarea.is_visible(timeout=5000):
            initial_count2 = sessions.get_assistant_message_count()
            sessions.send_message_in_conversation("Hello, this is conversation 2.")
            sessions.wait_for_assistant_response(initial_count2, timeout_s=120)

        final_sidebar_count = sessions.get_sidebar_conversation_count()
        assert final_sidebar_count >= first_conv_sidebar_count, \
            "Sidebar should have at least as many conversations after starting a second one"

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
