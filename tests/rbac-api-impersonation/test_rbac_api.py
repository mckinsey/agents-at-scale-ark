#!/usr/bin/env python3
"""
RBAC API Impersonation Test Script

This script tests the user impersonation feature at the API layer,
validating that RBAC policies are correctly enforced for different user roles.

Prerequisites:
- Ark installed with impersonation enabled
- OIDC provider (Keycloak) configured
- Test users created with appropriate group memberships
- RBAC bindings applied (see manifests/a00-rbac.yaml)

Usage:
    python test_rbac_api.py --api-url http://localhost:8000 --keycloak-url http://localhost:8080

Environment Variables:
    VIEWER_USERNAME: Username for viewer test (default: viewer@example.com)
    VIEWER_PASSWORD: Password for viewer test
    ADMIN_USERNAME: Username for admin test (default: admin@example.com)
    ADMIN_PASSWORD: Password for admin test
    NO_ACCESS_USERNAME: Username for no-access test (default: noaccess@example.com)
    NO_ACCESS_PASSWORD: Password for no-access test
"""

import argparse
import json
import os
import sys
from typing import Dict, Optional, Tuple

import requests
from requests.auth import HTTPBasicAuth


class RBACTester:
    """Test RBAC enforcement at the API layer."""

    def __init__(self, api_url: str, keycloak_url: str, namespace: str = "default"):
        self.api_url = api_url.rstrip('/')
        self.keycloak_url = keycloak_url.rstrip('/')
        self.namespace = namespace
        self.realm = "master"  # Default Keycloak realm
        self.client_id = "ark-client-id"

    def get_token(self, username: str, password: str) -> Optional[str]:
        """Get JWT token from Keycloak."""
        token_url = f"{self.keycloak_url}/realms/{self.realm}/protocol/openid-connect/token"
        data = {
            "grant_type": "password",
            "client_id": self.client_id,
            "username": username,
            "password": password,
        }

        try:
            response = requests.post(token_url, data=data)
            response.raise_for_status()
            return response.json().get("access_token")
        except Exception as e:
            print(f"❌ Failed to get token for {username}: {e}")
            return None

    def make_request(
        self,
        method: str,
        path: str,
        token: Optional[str] = None,
        data: Optional[Dict] = None,
        impersonate_headers: Optional[Dict] = None
    ) -> Tuple[int, Optional[Dict]]:
        """Make API request with optional JWT token."""
        url = f"{self.api_url}{path}"
        headers = {}

        if token:
            headers["Authorization"] = f"Bearer {token}"

        if impersonate_headers:
            headers.update(impersonate_headers)

        if data:
            headers["Content-Type"] = "application/json"

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=data,
                timeout=10
            )

            try:
                response_data = response.json()
            except:
                response_data = None

            return response.status_code, response_data
        except Exception as e:
            print(f"❌ Request failed: {e}")
            return 0, None

    def test_viewer_read_access(self, token: str) -> bool:
        """Test that viewer can list resources."""
        print("\n🔍 Testing viewer read access...")

        resources = [
            ("agents", f"/v1/agents?namespace={self.namespace}"),
            ("models", f"/v1/models?namespace={self.namespace}"),
            ("queries", f"/v1/queries?namespace={self.namespace}"),
            ("teams", f"/v1/teams?namespace={self.namespace}"),
            ("tools", f"/v1/tools?namespace={self.namespace}"),
            ("memories", f"/v1/memories?namespace={self.namespace}"),
            ("mcpservers", f"/v1/mcpservers?namespace={self.namespace}"),
            ("a2aservers", f"/v1/a2aservers?namespace={self.namespace}"),
            ("a2atasks", f"/v1/a2atasks?namespace={self.namespace}"),
            ("executionengines", f"/v1/executionengines?namespace={self.namespace}"),
        ]

        all_passed = True
        for resource_type, path in resources:
            status, data = self.make_request("GET", path, token)
            if status == 200:
                print(f"  ✅ Viewer can list {resource_type}")
            else:
                print(f"  ❌ Viewer failed to list {resource_type}: {status}")
                all_passed = False

        return all_passed

    def test_viewer_write_denial(self, token: str) -> bool:
        """Test that viewer cannot create/update/delete resources."""
        print("\n🔍 Testing viewer write denial...")

        # Try to create an agent
        agent_data = {
            "metadata": {
                "name": "viewer-test-agent",
                "namespace": self.namespace
            },
            "spec": {
                "model": {"name": "test-model"},
                "systemPrompt": "Test agent"
            }
        }

        status, data = self.make_request(
            "POST",
            f"/v1/agents?namespace={self.namespace}",
            token,
            agent_data
        )

        if status == 403:
            print(f"  ✅ Viewer correctly denied agent creation (403)")
            if data:
                print(f"     Error message: {data.get('detail', 'No detail')}")
            return True
        else:
            print(f"  ❌ Viewer should not be able to create agents: {status}")
            return False

    def test_admin_full_access(self, token: str) -> bool:
        """Test that admin has full CRUD access."""
        print("\n🔍 Testing admin full access...")

        # Create agent
        agent_data = {
            "metadata": {
                "name": "admin-test-agent",
                "namespace": self.namespace
            },
            "spec": {
                "model": {"name": "test-model"},
                "systemPrompt": "Test agent for admin"
            }
        }

        status, data = self.make_request(
            "POST",
            f"/v1/agents?namespace={self.namespace}",
            token,
            agent_data
        )

        if status in (200, 201):
            print(f"  ✅ Admin can create agents ({status})")
        else:
            print(f"  ❌ Admin failed to create agent: {status}")
            return False

        # Read agent
        status, data = self.make_request(
            "GET",
            f"/v1/agents/admin-test-agent?namespace={self.namespace}",
            token
        )

        if status == 200:
            print(f"  ✅ Admin can read agents")
        else:
            print(f"  ❌ Admin failed to read agent: {status}")
            return False

        # Update agent
        update_data = {
            "metadata": {
                "name": "admin-test-agent",
                "namespace": self.namespace
            },
            "spec": {
                "model": {"name": "test-model"},
                "systemPrompt": "Updated test agent"
            }
        }

        status, data = self.make_request(
            "PUT",
            f"/v1/agents/admin-test-agent?namespace={self.namespace}",
            token,
            update_data
        )

        if status == 200:
            print(f"  ✅ Admin can update agents")
        else:
            print(f"  ❌ Admin failed to update agent: {status}")
            # Continue even if update fails

        # Delete agent
        status, data = self.make_request(
            "DELETE",
            f"/v1/agents/admin-test-agent?namespace={self.namespace}",
            token
        )

        if status in (200, 204):
            print(f"  ✅ Admin can delete agents ({status})")
        else:
            print(f"  ❌ Admin failed to delete agent: {status}")
            return False

        return True

    def test_no_access_denial(self, token: str) -> bool:
        """Test that user with no permissions is denied."""
        print("\n🔍 Testing no-access user denial...")

        status, data = self.make_request(
            "GET",
            f"/v1/agents?namespace={self.namespace}",
            token
        )

        if status == 403:
            print(f"  ✅ No-access user correctly denied (403)")
            return True
        else:
            print(f"  ❌ No-access user should be denied: {status}")
            return False

    def test_header_injection_prevention(self, token: str) -> bool:
        """Test that client-provided Impersonate-* headers are rejected."""
        print("\n🔍 Testing header injection prevention...")

        impersonate_headers = {
            "Impersonate-User": "admin@example.com",
            "Impersonate-Group": "ark-admin"
        }

        status, data = self.make_request(
            "GET",
            f"/v1/agents?namespace={self.namespace}",
            token,
            impersonate_headers=impersonate_headers
        )

        if status == 403:
            print(f"  ✅ Client impersonation headers correctly rejected (403)")
            return True
        else:
            print(f"  ❌ Client impersonation headers should be rejected: {status}")
            return False

    def run_all_tests(
        self,
        viewer_username: str,
        viewer_password: str,
        admin_username: str,
        admin_password: str,
        no_access_username: str,
        no_access_password: str
    ) -> bool:
        """Run all RBAC tests."""
        print("=" * 70)
        print("RBAC API Impersonation Test Suite")
        print("=" * 70)

        # Get tokens
        print("\n📝 Obtaining JWT tokens...")
        viewer_token = self.get_token(viewer_username, viewer_password)
        admin_token = self.get_token(admin_username, admin_password)
        no_access_token = self.get_token(no_access_username, no_access_password)

        if not all([viewer_token, admin_token, no_access_token]):
            print("❌ Failed to obtain all required tokens")
            return False

        print("✅ All tokens obtained successfully")

        # Run tests
        results = {
            "viewer_read": self.test_viewer_read_access(viewer_token),
            "viewer_write_denial": self.test_viewer_write_denial(viewer_token),
            "admin_full_access": self.test_admin_full_access(admin_token),
            "no_access_denial": self.test_no_access_denial(no_access_token),
            "header_injection": self.test_header_injection_prevention(viewer_token),
        }

        # Summary
        print("\n" + "=" * 70)
        print("Test Results Summary")
        print("=" * 70)

        for test_name, passed in results.items():
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"{test_name:30s} {status}")

        all_passed = all(results.values())
        print("\n" + "=" * 70)
        if all_passed:
            print("🎉 All tests passed!")
        else:
            print("⚠️  Some tests failed")
        print("=" * 70)

        return all_passed


def main():
    parser = argparse.ArgumentParser(description="Test RBAC API impersonation")
    parser.add_argument("--api-url", default="http://localhost:8000", help="ARK API URL")
    parser.add_argument("--keycloak-url", default="http://localhost:8080", help="Keycloak URL")
    parser.add_argument("--namespace", default="default", help="Kubernetes namespace")

    args = parser.parse_args()

    # Get credentials from environment
    viewer_username = os.getenv("VIEWER_USERNAME", "viewer@example.com")
    viewer_password = os.getenv("VIEWER_PASSWORD", "viewer")
    admin_username = os.getenv("ADMIN_USERNAME", "admin@example.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin")
    no_access_username = os.getenv("NO_ACCESS_USERNAME", "noaccess@example.com")
    no_access_password = os.getenv("NO_ACCESS_PASSWORD", "noaccess")

    tester = RBACTester(args.api_url, args.keycloak_url, args.namespace)

    success = tester.run_all_tests(
        viewer_username, viewer_password,
        admin_username, admin_password,
        no_access_username, no_access_password
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
