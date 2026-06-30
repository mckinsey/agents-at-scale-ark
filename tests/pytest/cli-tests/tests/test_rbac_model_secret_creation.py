import pytest

from helpers.rbac_helper import (
    DEMO_GROUP,
    DEMO_MODEL,
    DEMO_QUERY,
    DEMO_SECRET,
    DEMO_TARGET_AGENT,
    DEMO_TEAM,
    DEMO_USER,
    RBACHelper,
)

# (kubectl resource for deletion, resource name, helper method that creates it
# as the impersonated demo user). Creation is driven through kubectl --as, so
# RBAC is enforced by the Kubernetes API authorizer, never the ark-api/broker
# path.
CASES = [
    ("secret", DEMO_SECRET, "create_secret_as"),
    ("model.ark.mckinsey.com", DEMO_MODEL, "create_model_as"),
    ("query.ark.mckinsey.com", DEMO_QUERY, "create_query_as"),
    ("team.ark.mckinsey.com", DEMO_TEAM, "create_team_as"),
]
IDS = ["secret", "model", "query", "team"]


@pytest.fixture
def rbac():
    return RBACHelper()


@pytest.fixture(autouse=True)
def clean_state(rbac):
    def _reset():
        rbac.delete_grant()
        rbac.delete_resource("agent.ark.mckinsey.com", DEMO_TARGET_AGENT)
        for kind, name, _ in CASES:
            rbac.delete_resource(kind, name)

    _reset()
    # Queries and teams reference this agent to satisfy the validating webhook.
    ok, out = rbac.apply_agent(DEMO_TARGET_AGENT)
    assert ok, f"failed to create target agent: {out}"
    yield
    _reset()


# One class so pytest-xdist `--dist loadscope` keeps the whole file on a single
# worker. The forbidden and allowed cases share the demo grant and resource
# names in one namespace; splitting them across workers would let the allowed
# case's grant race the forbidden case's teardown.
@pytest.mark.cli
@pytest.mark.rbac
class TestResourceCreationRBAC:
    @pytest.mark.parametrize("kind, name, method", CASES, ids=IDS)
    def test_creation_forbidden(self, rbac, kind, name, method):
        ok, out = getattr(rbac, method)(name, DEMO_USER, DEMO_GROUP)
        assert not ok, f"{kind} creation should be denied without RBAC, got: {out}"
        assert "cannot create resource" in out, f"expected an RBAC authorization denial for {kind}, got: {out}"

    @pytest.mark.parametrize("kind, name, method", CASES, ids=IDS)
    def test_creation_allowed(self, rbac, kind, name, method):
        applied, err = rbac.apply_grant()
        assert applied, f"failed to apply RBAC grant: {err}"
        ok, out = getattr(rbac, method)(name, DEMO_USER, DEMO_GROUP)
        assert ok, f"{kind} creation should succeed with RBAC, got: {out}"
