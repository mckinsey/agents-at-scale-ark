#!/usr/bin/env python3
"""
Keycloak SSO Setup Script for Ark Dashboard

Automates the configuration of Keycloak for Ark Dashboard OIDC authentication.
Creates a client, configures redirect URIs, and sets up a test user.
"""

import sys
import time
import requests
from requests.auth import HTTPBasicAuth
from typing import Optional


class KeycloakSetup:
    def __init__(
        self,
        keycloak_url: str = "http://keycloak.127.0.0.1.nip.io:8080",
        admin_username: str = "admin",
        admin_password: str = "admin",
        realm: str = "master"
    ):
        self.base_url = keycloak_url
        self.admin_username = admin_username
        self.admin_password = admin_password
        self.realm = realm
        self.token: Optional[str] = None

    def wait_for_keycloak(self, timeout: int = 120, interval: int = 5):
        print(f"Waiting for Keycloak to be ready at {self.base_url}...")
        start_time = time.time()

        while time.time() - start_time < timeout:
            try:
                response = requests.get(f"{self.base_url}/health/ready", timeout=5)
                if response.status_code == 200:
                    print("✓ Keycloak is ready")
                    return True
            except requests.exceptions.RequestException:
                pass

            time.sleep(interval)

        print(f"✗ Keycloak did not become ready within {timeout} seconds")
        return False

    def get_admin_token(self) -> bool:
        print("Getting admin token...")

        try:
            response = requests.post(
                f"{self.base_url}/realms/master/protocol/openid-connect/token",
                data={
                    "client_id": "admin-cli",
                    "username": self.admin_username,
                    "password": self.admin_password,
                    "grant_type": "password"
                },
                timeout=10
            )

            if response.status_code == 200:
                self.token = response.json()["access_token"]
                print("✓ Got admin token")
                return True
            else:
                print(f"✗ Failed to get token: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            print(f"✗ Error getting token: {e}")
            return False

    def create_client(
        self,
        client_id: str = "ark-dashboard",
        redirect_uris: list = None
    ) -> Optional[str]:
        if redirect_uris is None:
            redirect_uris = [
                "http://dashboard.127.0.0.1.nip.io:8080/*",
                "http://127.0.0.1.nip.io:8080/*",
                "http://localhost:3000/*"
            ]

        print(f"Creating client '{client_id}'...")

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

        existing_client = requests.get(
            f"{self.base_url}/admin/realms/{self.realm}/clients",
            headers=headers,
            params={"clientId": client_id}
        )

        if existing_client.status_code == 200 and existing_client.json():
            print(f"⚠ Client '{client_id}' already exists")
            client_uuid = existing_client.json()[0]["id"]
        else:
            client_config = {
                "clientId": client_id,
                "enabled": True,
                "protocol": "openid-connect",
                "publicClient": False,
                "standardFlowEnabled": True,
                "directAccessGrantsEnabled": True,
                "serviceAccountsEnabled": False,
                "redirectUris": redirect_uris,
                "webOrigins": ["*"],
                "attributes": {
                    "pkce.code.challenge.method": "S256"
                }
            }

            response = requests.post(
                f"{self.base_url}/admin/realms/{self.realm}/clients",
                headers=headers,
                json=client_config
            )

            if response.status_code == 201:
                print(f"✓ Created client '{client_id}'")
                location = response.headers.get("Location")
                client_uuid = location.split("/")[-1]
            else:
                print(f"✗ Failed to create client: {response.status_code} - {response.text}")
                return None

        secret_response = requests.get(
            f"{self.base_url}/admin/realms/{self.realm}/clients/{client_uuid}/client-secret",
            headers=headers
        )

        if secret_response.status_code == 200:
            client_secret = secret_response.json()["value"]
            print(f"✓ Client secret: {client_secret}")
            return client_secret
        else:
            print(f"✗ Failed to get client secret: {secret_response.status_code}")
            return None

    def create_user(
        self,
        username: str = "testuser",
        password: str = "testpass",
        email: str = "testuser@example.com",
        first_name: str = "Test",
        last_name: str = "User"
    ) -> bool:
        print(f"Creating user '{username}'...")

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

        existing_user = requests.get(
            f"{self.base_url}/admin/realms/{self.realm}/users",
            headers=headers,
            params={"username": username}
        )

        if existing_user.status_code == 200 and existing_user.json():
            print(f"⚠ User '{username}' already exists")
            user_id = existing_user.json()[0]["id"]
        else:
            user_config = {
                "username": username,
                "email": email,
                "firstName": first_name,
                "lastName": last_name,
                "enabled": True,
                "emailVerified": True
            }

            response = requests.post(
                f"{self.base_url}/admin/realms/{self.realm}/users",
                headers=headers,
                json=user_config
            )

            if response.status_code == 201:
                print(f"✓ Created user '{username}'")
                location = response.headers.get("Location")
                user_id = location.split("/")[-1]
            else:
                print(f"✗ Failed to create user: {response.status_code} - {response.text}")
                return False

        password_response = requests.put(
            f"{self.base_url}/admin/realms/{self.realm}/users/{user_id}/reset-password",
            headers=headers,
            json={
                "type": "password",
                "value": password,
                "temporary": False
            }
        )

        if password_response.status_code == 204:
            print(f"✓ Set password for user '{username}'")
            return True
        else:
            print(f"✗ Failed to set password: {password_response.status_code}")
            return False

    def print_configuration(self, client_secret: str, client_id: str = "ark-dashboard"):
        print("\n" + "="*70)
        print("KEYCLOAK SSO CONFIGURATION")
        print("="*70)
        print("\nAdd these values to your ark-dashboard Helm values:\n")
        print(f"""
  env:
    - name: AUTH_MODE
      value: "oidc"
    - name: BASE_URL
      value: "http://dashboard.127.0.0.1.nip.io:8080"
    - name: AUTH_URL
      value: "http://dashboard.127.0.0.1.nip.io:8080/api/auth"
    - name: OIDC_ISSUER_URL
      value: "{self.base_url}/realms/{self.realm}"
    - name: OIDC_CLIENT_ID
      value: "{client_id}"
    - name: OIDC_CLIENT_SECRET
      value: "{client_secret}"
    - name: OIDC_PROVIDER_NAME
      value: "Keycloak"
    - name: OIDC_PROVIDER_ID
      value: "keycloak"
    - name: AUTH_SECRET
      value: "change-this-to-a-random-secret-in-production"
    - name: SESSION_MAX_AGE
      value: "86400"
""")
        print("\nTest credentials:")
        print("  Username: testuser")
        print("  Password: testpass")
        print("\n" + "="*70 + "\n")


def main():
    setup = KeycloakSetup()

    if not setup.wait_for_keycloak():
        print("\n✗ Keycloak is not available. Make sure it's running with 'devspace dev'")
        sys.exit(1)

    if not setup.get_admin_token():
        print("\n✗ Failed to authenticate with Keycloak")
        sys.exit(1)

    client_secret = setup.create_client()
    if not client_secret:
        print("\n✗ Failed to create client")
        sys.exit(1)

    if not setup.create_user():
        print("\n✗ Failed to create test user")
        sys.exit(1)

    setup.print_configuration(client_secret)
    print("✓ Keycloak SSO setup complete!\n")


if __name__ == "__main__":
    main()
