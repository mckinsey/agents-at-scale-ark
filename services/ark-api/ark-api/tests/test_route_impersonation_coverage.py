"""Every route must declare the impersonation dependency or be explicitly allowlisted.

Guards against the regression class of #3174: a route (or a refactor of one)
silently running against the Kubernetes API as the ark-api service account
instead of the authenticated user, bypassing per-user RBAC.
"""
import unittest

from fastapi.routing import APIRoute

from ark_api.main import app
from ark_api.auth.dependencies import get_impersonation_config

# Routes that intentionally run as the service account. Each entry needs a reason.
INTENTIONAL_SERVICE_ACCOUNT_ROUTES = {
    # Public, unauthenticated probes; no user identity exists.
    ("GET", "/health"),
    ("GET", "/ready"),
    # FastAPI-provided documentation endpoints; no Kubernetes access.
    ("GET", "/docs"),
    ("GET", "/openapi.json"),
    # Reports cluster/server metadata, not user-scoped resources.
    ("GET", "/v1/system-info"),
    # Parses uploaded bytes; no Kubernetes access.
    ("POST", "/v1/file-preview/spreadsheet"),
    ("GET", "/v1/file-preview/health"),
    # Service-owned state: API key Secrets are scoped by created_by ownership and
    # gated by require_api_key_owner plus an impersonated SSAR on create.
    ("POST", "/v1/api-keys"),
    ("GET", "/v1/api-keys"),
    ("DELETE", "/v1/api-keys/{public_key}"),
    # Service-owned state: export history metadata ConfigMap in the pod namespace.
    ("GET", "/v1/export/last-export-time"),
    # Helm release data read via pyhelm3 with ambient credentials; no per-user path.
    ("GET", "/v1/ark-services/marketplace-items"),
}


def _route_ids(route: APIRoute):
    return {(method, route.path) for method in route.methods if method != "HEAD" or len(route.methods) == 1}


def _has_impersonation_dependency(dependant) -> bool:
    for dep in dependant.dependencies:
        if dep.call is get_impersonation_config or _has_impersonation_dependency(dep):
            return True
    return False


def _api_routes():
    return [route for route in app.routes if isinstance(route, APIRoute)]


class TestRouteImpersonationCoverage(unittest.TestCase):
    def test_all_routes_declare_impersonation_or_are_allowlisted(self):
        missing = []
        for route in _api_routes():
            if _has_impersonation_dependency(route.dependant):
                continue
            for route_id in _route_ids(route):
                if route_id not in INTENTIONAL_SERVICE_ACCOUNT_ROUTES:
                    missing.append(route_id)

        self.assertEqual(missing, [], (
            "Routes without the impersonation dependency (their Kubernetes calls run "
            "as the ark-api service account, bypassing user RBAC): "
            f"{sorted(missing)}. Add impersonation via Depends(get_impersonation_config) "
            "or, if service-account access is intentional, allowlist the route here "
            "with a reason."
        ))

    def test_allowlist_has_no_stale_entries(self):
        all_route_ids = set()
        impersonated_route_ids = set()
        for route in _api_routes():
            ids = _route_ids(route)
            all_route_ids |= ids
            if _has_impersonation_dependency(route.dependant):
                impersonated_route_ids |= ids

        unknown = INTENTIONAL_SERVICE_ACCOUNT_ROUTES - all_route_ids
        self.assertEqual(unknown, set(), f"Allowlist entries for routes that no longer exist: {sorted(unknown)}")

        covered = INTENTIONAL_SERVICE_ACCOUNT_ROUTES & impersonated_route_ids
        self.assertEqual(covered, set(), (
            f"Allowlisted routes now declare the impersonation dependency; remove them: {sorted(covered)}"
        ))


if __name__ == "__main__":
    unittest.main()
