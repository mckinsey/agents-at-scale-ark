import logging
import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage
from pages.agents_page import AgentsPage
from pages.teams_page import TeamsPage

logger = logging.getLogger(__name__)


@pytest.mark.teams
@pytest.mark.xdist_group("ark_team_loops")
class TestTeamSequentialLoops:

    @pytest.fixture(autouse=True, scope="class")
    def setup_shared_resources(self, request, page: Page):
        secrets = SecretsPage(page)
        models = ModelsPage(page)
        agents = AgentsPage(page)

        model_data = models.TEST_DATA["openai"]

        secret_result = secrets.create_secret_for_test("loops-secret", model_data["env_key"])
        assert secret_result["in_table"], "Secret must be visible before setting up shared agent"
        request.cls._secret_name = secret_result["name"]
        logger.info(f"Shared secret created: {request.cls._secret_name}")

        model_result = models.create_model_for_test("loops-model", secret_result["name"], secrets)
        assert model_result["in_table"], "Model must be visible before setting up shared agent"
        request.cls._model_name = model_result["name"]
        logger.info(f"Shared model created: {request.cls._model_name}")

        agent_result = agents.create_agent_for_test("loops-agent", model_result["name"])
        assert agent_result["in_table"], "Agent must be visible before running team tests"
        request.cls._agent_name = agent_result["name"]
        logger.info(f"Shared agent created: {request.cls._agent_name}")

        request.cls._created_teams = []

        yield

        logger.info("Tearing down shared resources...")
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        for team_name in list(request.cls._created_teams):
            if teams.is_team_in_table(team_name):
                teams.delete_team_with_verification(team_name)
                logger.info(f"Cleaned up team: {team_name}")

        agents.navigate_to_agents_tab()
        agents.delete_agent_with_verification(request.cls._agent_name)
        logger.info(f"Cleaned up agent: {request.cls._agent_name}")

        models.navigate_to_models_tab()
        models.delete_model_with_verification(request.cls._model_name)
        logger.info(f"Cleaned up model: {request.cls._model_name}")

        secrets.navigate_to_secrets_tab()
        secrets.delete_secret_with_verification(request.cls._secret_name)
        logger.info(f"Cleaned up secret: {request.cls._secret_name}")

    def _open_add_team_dialog(self, teams: TeamsPage) -> None:
        teams.navigate_to_teams_tab()
        teams.page.locator(teams.ADD_TEAM_BUTTON).first.click()
        teams.wait_for_load_state("domcontentloaded")
        teams.page.locator("input").first.wait_for(state="visible", timeout=10000)

    def test_round_robin_absent_from_strategy_dropdown(self, page: Page):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()

        options = teams.get_strategy_options()
        lower_options = [o.lower() for o in options]
        logger.info(f"Strategy dropdown options: {options}")

        assert any("sequential" in o for o in lower_options), \
            f"Sequential strategy must be available in dropdown; got: {options}"
        assert not any("round" in o for o in lower_options), \
            f"Round Robin must not appear in strategy dropdown; got: {options}"

    def test_loops_checkbox_hidden_for_selector_strategy(self, page: Page):
        teams = TeamsPage(page)
        self._open_add_team_dialog(teams)
        teams.select_strategy_in_form("Selector")
        logger.info("Selected Selector strategy, checking loops checkbox visibility")

        assert not teams.is_loops_checkbox_visible(), \
            "Loops checkbox must not be visible when Selector strategy is chosen"

        teams.wait_for_modal_close()

    def test_loops_checkbox_visible_for_sequential_strategy(self, page: Page):
        teams = TeamsPage(page)
        self._open_add_team_dialog(teams)
        teams.select_strategy_in_form("Sequential")
        logger.info("Selected Sequential strategy, checking loops checkbox visibility")

        assert teams.is_loops_checkbox_visible(), \
            "Loops checkbox must be visible when Sequential strategy is chosen"

        teams.wait_for_modal_close()

    def test_max_turns_hidden_until_loops_enabled(self, page: Page):
        teams = TeamsPage(page)
        self._open_add_team_dialog(teams)
        teams.select_strategy_in_form("Sequential")

        assert not teams.is_max_turns_field_visible(), \
            "Max Turns field must not be visible before enabling loops"

        teams.toggle_loops_checkbox()
        logger.info("Loops checkbox enabled, verifying Max Turns appears")

        assert teams.is_max_turns_field_visible(), \
            "Max Turns field must appear after enabling loops"

        teams.wait_for_modal_close()

    def test_max_turns_hides_when_loops_unchecked(self, page: Page):
        teams = TeamsPage(page)
        self._open_add_team_dialog(teams)
        teams.select_strategy_in_form("Sequential")

        teams.toggle_loops_checkbox()
        assert teams.is_max_turns_field_visible(), \
            "Max Turns field must appear after enabling loops"

        teams.toggle_loops_checkbox()
        logger.info("Loops checkbox disabled, verifying Max Turns disappears")

        assert not teams.is_max_turns_field_visible(), \
            "Max Turns field must disappear after disabling loops"

        teams.wait_for_modal_close()

    def test_create_sequential_team_with_loops(self, page: Page):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()

        team_name = teams.generate_team_name("seq-loops")
        logger.info(f"Creating sequential team with loops: {team_name}")

        result = teams.create_sequential_loops_team(
            team_name=team_name,
            member_name=self._agent_name,
            max_turns="6",
            loops=True,
        )
        self._created_teams.append(team_name)
        logger.info(f"Team created: {team_name}, in_table={result['in_table']}")

        assert result["loops_checkbox_visible"], \
            f"Loops checkbox must have been visible during team '{team_name}' creation"
        assert result["max_turns_visible"], \
            f"Max Turns field must have been visible when loops enabled for '{team_name}'"
        assert result["popup_visible"], \
            f"Success popup must appear after creating team '{team_name}'"
        assert result["in_table"], \
            f"Team '{team_name}' must appear in the teams list after creation"

    def test_sequential_loops_team_shows_loops_label_in_row(self, page: Page):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()

        loop_teams = [t for t in self._created_teams if "seq-loops" in t]
        if not loop_teams:
            pytest.skip("No sequential+loops team created yet — skipping row label check")

        team_name = loop_teams[0]
        logger.info(f"Checking loops label in row for team: {team_name}")

        assert teams.is_team_in_table(team_name), \
            f"Team '{team_name}' must be present in the list before checking its row"

        row_text = teams.get_team_row_strategy_text(team_name)
        logger.info(f"Row strategy text for '{team_name}': '{row_text}'")

        assert "loop" in row_text.lower(), \
            f"Team row must show a 'Loops' indicator; got: '{row_text}'"

    def test_create_sequential_team_without_loops(self, page: Page):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()

        team_name = teams.generate_team_name("seq-no-loops")
        logger.info(f"Creating sequential team without loops: {team_name}")

        result = teams.create_sequential_loops_team(
            team_name=team_name,
            member_name=self._agent_name,
            max_turns="3",
            loops=False,
        )
        self._created_teams.append(team_name)
        logger.info(f"Team created: {team_name}, in_table={result['in_table']}")

        assert result["popup_visible"], \
            f"Success popup must appear after creating team '{team_name}'"
        assert result["in_table"], \
            f"Team '{team_name}' must appear in the teams list after creation"

    def test_sequential_no_loops_row_shows_plain_sequential(self, page: Page):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()

        no_loop_teams = [t for t in self._created_teams if "seq-no-loops" in t]
        if not no_loop_teams:
            pytest.skip("No sequential-without-loops team created yet — skipping row label check")

        team_name = no_loop_teams[0]
        logger.info(f"Checking row strategy text for non-loops team: {team_name}")

        assert teams.is_team_in_table(team_name), \
            f"Team '{team_name}' must be present in the list before checking its row"

        row_text = teams.get_team_row_strategy_text(team_name)
        logger.info(f"Row strategy text for '{team_name}': '{row_text}'")

        strategy_indicator = ""
        for line in row_text.split("\n"):
            if "\u00b7" in line or " · " in line or "member" in line.lower():
                strategy_indicator = line.split("\u00b7", 1)[-1].strip().lower() if "\u00b7" in line else line.lower()
                break

        logger.info(f"Extracted strategy indicator: '{strategy_indicator}'")
        assert "sequential" in strategy_indicator, \
            f"Row must display 'Sequential' for a non-loops team; strategy part: '{strategy_indicator}'"
        assert "loop" not in strategy_indicator, \
            f"Row strategy indicator must NOT show 'Loops' for a non-loops team; strategy part: '{strategy_indicator}'"

    def test_delete_sequential_loops_team(self, page: Page):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()

        loop_teams = [t for t in self._created_teams if "seq-loops" in t]
        if not loop_teams:
            pytest.skip("No sequential+loops team found to delete")

        team_name = loop_teams[0]
        logger.info(f"Deleting sequential+loops team: {team_name}")

        result = teams.delete_team_with_verification(team_name)
        if not result["delete_available"]:
            pytest.skip(f"Delete not available for team '{team_name}' in current UI state")

        assert result["confirm_dialog_visible"], \
            f"Confirm dialog must appear when deleting team '{team_name}'"
        assert result["deleted_from_table"], \
            f"Team '{team_name}' must be removed from the list after deletion"

        self._created_teams.remove(team_name)
        logger.info(f"Team deleted and removed from tracking: {team_name}")

    def test_delete_sequential_no_loops_team(self, page: Page):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()

        no_loop_teams = [t for t in self._created_teams if "seq-no-loops" in t]
        if not no_loop_teams:
            pytest.skip("No sequential-without-loops team found to delete")

        team_name = no_loop_teams[0]
        logger.info(f"Deleting sequential-without-loops team: {team_name}")

        result = teams.delete_team_with_verification(team_name)
        if not result["delete_available"]:
            pytest.skip(f"Delete not available for team '{team_name}' in current UI state")

        assert result["deleted_from_table"], \
            f"Team '{team_name}' must be removed from the list after deletion"

        self._created_teams.remove(team_name)
        logger.info(f"Team deleted and removed from tracking: {team_name}")
