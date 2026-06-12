import pytest

from helpers.rbac_helper import (
    ADMIN_GROUP,
    ADMIN_USER,
    OTHER_NAMESPACE,
    VIEWER_GROUP,
    VIEWER_USER,
    RBACHelper,
)

# Two resources: one core CRD and one less-common CRD. Sufficient to prove the
# ClusterRole bindings work without re-testing K8s parametrize mechanics 9×.
PROBE_RESOURCES = ["agents", "a2atasks"]

READ_VERBS = ["list", "get"]
WRITE_VERBS = ["create", "update", "delete"]


@pytest.fixture(scope="module")
def rbac():
    helper = RBACHelper()
    ok, msg = helper.apply_bindings()
    assert ok, f"Failed to apply RBAC test bindings: {msg}"
    yield helper
    helper.delete_bindings()


@pytest.mark.cli
@pytest.mark.rbac
class TestAdminRole:
    """ark-admin group has full editor access on Ark resources."""

    @pytest.mark.parametrize("resource", PROBE_RESOURCES)
    def test_admin_full_access(self, rbac, resource):
        denied = [v for v in READ_VERBS + WRITE_VERBS if not rbac.can_i(v, resource, ADMIN_USER, ADMIN_GROUP)]
        assert not denied, f"admin denied {denied} on {resource}"


@pytest.mark.cli
@pytest.mark.rbac
class TestViewerRole:
    """ark-viewers group is read-only: list/get allowed, write verbs denied."""

    @pytest.mark.parametrize("resource", PROBE_RESOURCES)
    def test_viewer_read_allowed(self, rbac, resource):
        denied = [v for v in READ_VERBS if not rbac.can_i(v, resource, VIEWER_USER, VIEWER_GROUP)]
        assert not denied, f"viewer denied read verb {denied} on {resource}"

    @pytest.mark.parametrize("resource", PROBE_RESOURCES)
    def test_viewer_write_denied(self, rbac, resource):
        allowed = [v for v in WRITE_VERBS if rbac.can_i(v, resource, VIEWER_USER, VIEWER_GROUP)]
        assert not allowed, f"viewer must not have write verb {allowed} on {resource}"


@pytest.mark.cli
@pytest.mark.rbac
class TestNamespaceScoping:
    """RoleBindings are namespace-scoped to 'default'. Both groups must be
    denied in any other namespace, confirming multi-tenant isolation."""

    @pytest.mark.parametrize("resource", PROBE_RESOURCES)
    def test_bindings_scoped_to_default(self, rbac, resource):
        admin_leak = rbac.can_i("list", resource, ADMIN_USER, ADMIN_GROUP, namespace=OTHER_NAMESPACE)
        viewer_leak = rbac.can_i("list", resource, VIEWER_USER, VIEWER_GROUP, namespace=OTHER_NAMESPACE)
        assert not admin_leak, f"admin must not access {resource} in {OTHER_NAMESPACE}"
        assert not viewer_leak, f"viewer must not access {resource} in {OTHER_NAMESPACE}"
