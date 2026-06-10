import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from helpers.rbac_helper import (
    ADMIN_GROUP,
    ADMIN_USER,
    NO_ACCESS_USER,
    OTHER_NAMESPACE,
    RESOURCES,
    VIEWER_GROUP,
    VIEWER_USER,
    RBACHelper,
)

ADMIN_VERBS = ["list", "get", "create", "update", "delete"]
VIEWER_VERBS_ALLOWED = ["list", "get"]
VIEWER_VERBS_DENIED = ["create", "update", "delete"]
NO_ACCESS_VERBS = ["list", "create", "delete"]


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
    """ark-admin group has full editor access (list/get/create/update/delete)
    on every resource type, verified via SubjectAccessReview."""

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_admin_full_access(self, rbac, resource):
        denied = [v for v in ADMIN_VERBS if not rbac.can_i(v, resource, ADMIN_USER, ADMIN_GROUP)]
        assert not denied, f"admin denied {denied} on {resource}"


@pytest.mark.cli
@pytest.mark.rbac
class TestViewerRole:
    """ark-viewers group is read-only: list/get allowed, write verbs denied."""

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_viewer_read_allowed(self, rbac, resource):
        denied = [v for v in VIEWER_VERBS_ALLOWED if not rbac.can_i(v, resource, VIEWER_USER, VIEWER_GROUP)]
        assert not denied, f"viewer denied read verb {denied} on {resource}"

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_viewer_write_denied(self, rbac, resource):
        allowed = [v for v in VIEWER_VERBS_DENIED if rbac.can_i(v, resource, VIEWER_USER, VIEWER_GROUP)]
        assert not allowed, f"viewer must not have write verb {allowed} on {resource}"


@pytest.mark.cli
@pytest.mark.rbac
class TestNoAccessUser:
    """A user with no group binding is denied on all verbs for every resource."""

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_no_access_all_denied(self, rbac, resource):
        allowed = [v for v in NO_ACCESS_VERBS if rbac.can_i(v, resource, NO_ACCESS_USER)]
        assert not allowed, f"unbound user must not have {allowed} on {resource}"


@pytest.mark.cli
@pytest.mark.rbac
class TestNamespaceScoping:
    """RoleBindings are namespace-scoped to 'default'. Both groups must be
    denied in any other namespace, confirming multi-tenant isolation."""

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_bindings_scoped_to_default(self, rbac, resource):
        admin_leak = rbac.can_i("list", resource, ADMIN_USER, ADMIN_GROUP, namespace=OTHER_NAMESPACE)
        viewer_leak = rbac.can_i("list", resource, VIEWER_USER, VIEWER_GROUP, namespace=OTHER_NAMESPACE)
        assert not admin_leak, f"admin must not access {resource} in {OTHER_NAMESPACE}"
        assert not viewer_leak, f"viewer must not access {resource} in {OTHER_NAMESPACE}"
