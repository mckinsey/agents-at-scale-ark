import pytest

from helpers.namespace_helper import NamespaceTestHelper
from helpers.ark_api_helper import get_api_url, is_api_reachable, get_resource_status

TEST_NAMESPACE = "test-ns-cli"
PREFIX = "test-ns-agent-"


@pytest.fixture(scope="module")
def helper():
    return NamespaceTestHelper(TEST_NAMESPACE, PREFIX)


@pytest.fixture(scope="module", autouse=True)
def setup_namespace(helper):
    helper.setup()
    yield
    helper.teardown()


@pytest.fixture(scope="module", autouse=True)
def api_available():
    url = get_api_url()
    assert is_api_reachable(), (
        f"ark-api is not reachable at {url}. "
        "Set ARK_API_URL to override, or ensure the local gateway is running."
    )


@pytest.mark.cli
@pytest.mark.namespace
class TestNamespaceIsolation:

    def test_agent_created_in_custom_namespace(self, helper):
        name = f"{PREFIX}create"
        success, message = helper.custom.create_agent(name, prompt="Test agent for namespace isolation.")
        assert success, f"Failed to create agent: {message}"
        assert helper.custom.verify_agent_exists(name), "Agent should exist in custom namespace"

    def test_agent_namespace_is_correct(self, helper):
        name = f"{PREFIX}ns-check"
        helper.custom.create_agent(name, prompt="Namespace check agent.")
        actual_ns = helper.custom.get_agent_namespace(name)
        assert actual_ns == TEST_NAMESPACE, (
            f"Agent namespace mismatch: expected '{TEST_NAMESPACE}', got '{actual_ns}'"
        )

    def test_agent_in_custom_namespace_not_visible_in_default(self, helper):
        name = f"{PREFIX}isolation"
        helper.custom.create_agent(name, prompt="Cross-namespace isolation check.")
        assert helper.custom.verify_agent_exists(name), "Agent should exist in custom namespace"
        assert not helper.default.verify_agent_exists(name), (
            "Agent created in custom namespace must not be visible in default namespace"
        )

    def test_agent_in_default_not_visible_in_custom_namespace(self, helper):
        name = f"{PREFIX}default-only"
        helper.default.create_agent(name, prompt="Default namespace only agent.")
        assert helper.default.verify_agent_exists(name), "Agent should exist in default namespace"
        assert not helper.custom.verify_agent_exists(name), (
            "Agent created in default namespace must not be visible in custom namespace"
        )

    def test_list_after_create_returns_custom_namespace_resources(self, helper):
        name = f"{PREFIX}list-check"
        helper.custom.create_agent(name, prompt="List check agent.")
        success, agents = helper.custom.list_agents()
        assert success, "Failed to list agents in custom namespace"
        assert name in agents, (
            f"Agent '{name}' should appear when listing agents in '{TEST_NAMESPACE}'"
        )

    def test_list_after_delete_in_custom_namespace(self, helper):
        name = f"{PREFIX}delete-list"
        helper.custom.create_agent(name, prompt="Delete list check agent.")
        assert helper.custom.verify_agent_exists(name)

        success, _ = helper.custom.delete_agent(name)
        assert success, "Failed to delete agent from custom namespace"

        assert not helper.custom.verify_agent_exists(name), (
            "Deleted agent must not appear in custom namespace after deletion"
        )

    def test_create_same_name_in_different_namespaces(self, helper):
        name = f"{PREFIX}same-name"
        s1, _ = helper.custom.create_agent(name, prompt="Custom namespace instance.")
        s2, _ = helper.default.create_agent(name, prompt="Default namespace instance.")
        assert s1, "Failed to create agent in custom namespace"
        assert s2, "Failed to create agent in default namespace"

        assert helper.custom.verify_agent_exists(name)
        assert helper.default.verify_agent_exists(name)

        custom_ns = helper.custom.get_agent_namespace(name)
        default_ns = helper.default.get_agent_namespace(name)
        assert custom_ns == TEST_NAMESPACE
        assert default_ns == "default"

    def test_get_agent_without_namespace_returns_404_not_500(self, helper):
        name = f"{PREFIX}404-check"
        success, message = helper.custom.create_agent(name, prompt="Issue 1399 test agent.")
        assert success, f"Failed to create agent: {message}"
        assert helper.custom.verify_agent_exists(name), "Agent must exist in custom namespace"

        status, body = get_resource_status("agents", name)
        assert status == 404, (
            f"Expected HTTP 404 for agent '{name}' (exists only in '{TEST_NAMESPACE}'), "
            f"got HTTP {status}. Body: {body}"
        )
        assert status != 500, (
            f"Got HTTP 500 Internal Server Error — issue #1399 is not fixed. Body: {body}"
        )
