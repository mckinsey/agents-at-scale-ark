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
    """ark-admin group is bound to the editor ClusterRole for every resource type,
    granting list + create + delete. Verified via SubjectAccessReview, so no OIDC
    provider is required."""

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_admin_can_list(self, rbac, resource):
        assert rbac.can_i("list", resource, ADMIN_USER, ADMIN_GROUP), (
            f"admin should be able to list {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_admin_can_create(self, rbac, resource):
        assert rbac.can_i("create", resource, ADMIN_USER, ADMIN_GROUP), (
            f"admin should be able to create {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_admin_can_delete(self, rbac, resource):
        assert rbac.can_i("delete", resource, ADMIN_USER, ADMIN_GROUP), (
            f"admin should be able to delete {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_admin_can_get(self, rbac, resource):
        assert rbac.can_i("get", resource, ADMIN_USER, ADMIN_GROUP), (
            f"admin should be able to get {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_admin_can_update(self, rbac, resource):
        assert rbac.can_i("update", resource, ADMIN_USER, ADMIN_GROUP), (
            f"admin should be able to update {resource}"
        )


@pytest.mark.cli
@pytest.mark.rbac
class TestViewerRole:
    """ark-viewers group is bound to the viewer ClusterRole: read-only. It can list
    every resource but must not create or delete any."""

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_viewer_can_list(self, rbac, resource):
        assert rbac.can_i("list", resource, VIEWER_USER, VIEWER_GROUP), (
            f"viewer should be able to list {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_viewer_can_get(self, rbac, resource):
        assert rbac.can_i("get", resource, VIEWER_USER, VIEWER_GROUP), (
            f"viewer should be able to get {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_viewer_cannot_create(self, rbac, resource):
        assert not rbac.can_i("create", resource, VIEWER_USER, VIEWER_GROUP), (
            f"viewer must not be able to create {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_viewer_cannot_update(self, rbac, resource):
        assert not rbac.can_i("update", resource, VIEWER_USER, VIEWER_GROUP), (
            f"viewer must not be able to update {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_viewer_cannot_delete(self, rbac, resource):
        assert not rbac.can_i("delete", resource, VIEWER_USER, VIEWER_GROUP), (
            f"viewer must not be able to delete {resource}"
        )


@pytest.mark.cli
@pytest.mark.rbac
class TestNoAccessUser:
    """A user with no group binding is denied on every resource and verb."""

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_no_access_cannot_list(self, rbac, resource):
        assert not rbac.can_i("list", resource, NO_ACCESS_USER), (
            f"unbound user must not be able to list {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_no_access_cannot_create(self, rbac, resource):
        assert not rbac.can_i("create", resource, NO_ACCESS_USER), (
            f"unbound user must not be able to create {resource}"
        )

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_no_access_cannot_delete(self, rbac, resource):
        assert not rbac.can_i("delete", resource, NO_ACCESS_USER), (
            f"unbound user must not be able to delete {resource}"
        )


@pytest.mark.cli
@pytest.mark.rbac
class TestNamespaceScoping:
    """The bindings are namespace-scoped RoleBindings in 'default'. The same
    groups must have no access in another namespace, confirming multi-tenant
    isolation rather than cluster-wide grants."""

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_admin_denied_in_other_namespace(self, rbac, resource):
        assert not rbac.can_i(
            "list", resource, ADMIN_USER, ADMIN_GROUP, namespace=OTHER_NAMESPACE
        ), f"admin must not have access to {resource} outside the bound namespace"

    @pytest.mark.parametrize("resource", RESOURCES)
    def test_viewer_denied_in_other_namespace(self, rbac, resource):
        assert not rbac.can_i(
            "list", resource, VIEWER_USER, VIEWER_GROUP, namespace=OTHER_NAMESPACE
        ), f"viewer must not have access to {resource} outside the bound namespace"
