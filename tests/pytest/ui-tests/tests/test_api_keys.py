"""Creating, copying and revoking an API key from the dashboard.

An API key is a labelled Secret rather than an Ark CR, and revoking is a soft
delete - the Secret stays and its is_active flag flips. The page only stops
listing the key, so the cluster assertions here are the only thing that tells
a real revoke apart from a row that merely disappeared.
"""

import base64
import json
import logging

import pytest
from playwright.sync_api import Page

from pages.api_keys_page import APIKeysPage
from shared.k8s import delete_resource, list_resources

logger = logging.getLogger(__name__)

API_KEY_LABEL = "ark.mckinsey.com/api-key"
API_KEY_ANNOTATION = "ark.mckinsey.com/api-key-metadata"
PUBLIC_KEY_PREFIX = "pk-ark-"
SECRET_KEY_PREFIX = "sk-ark-"


def _find_api_key_secret(display_name: str) -> dict | None:
    """The Secret behind an API key, found by the display name it was given.

    The Secret's own name is derived from the public key, so the annotation
    Ark writes is the only way back from the name shown on the page.
    """
    for secret in list_resources("secret"):
        labels = secret["metadata"].get("labels") or {}
        if labels.get(API_KEY_LABEL) != "true":
            continue
        raw = (secret["metadata"].get("annotations") or {}).get(API_KEY_ANNOTATION)
        if raw and json.loads(raw).get("name") == display_name:
            return secret
    return None


def _decoded(secret: dict, field: str) -> str:
    return base64.b64decode(secret["data"][field]).decode()


@pytest.fixture(scope="class")
def api_key_resources():
    """Carries the key's name between tests and hard-deletes its Secret after.

    Revoking only marks the Secret inactive, so without this the run would
    leave one behind every time.
    """
    created = {"name": None, "secret_name": None}

    yield created

    if created["secret_name"]:
        delete_resource("secret", created["secret_name"])


@pytest.mark.api_keys
@pytest.mark.xdist_group("ark_api_keys")
class TestAPIKeys:
    """One API key: created, copied from the row, then revoked."""

    def test_an_api_key_can_be_created(self, page: Page, api_key_resources: dict):
        api_keys = APIKeysPage(page)
        api_keys.navigate_to_api_keys()

        name = api_keys.generate_resource_name("ui-key")
        dialog_text = api_keys.open_create_dialog()
        assert "Create API Key" in dialog_text, (
            f"the create dialog should announce itself, but read {dialog_text!r}"
        )

        api_keys.submit_create_dialog(name)
        api_keys.wait_for_created_dialog()
        api_key_resources["name"] = name

        credentials = api_keys.created_credentials()
        assert credentials["public_key"].startswith(PUBLIC_KEY_PREFIX), (
            "the one-time dialog should show a public key, but showed "
            f"{credentials['public_key']!r}"
        )
        assert credentials["secret_key"].startswith(SECRET_KEY_PREFIX), (
            "the secret key is shown once and only here, but the dialog showed "
            f"{credentials['secret_key']!r}"
        )

        api_keys.dismiss_created_dialog()
        api_keys.wait_for_row(name)

        secret = _find_api_key_secret(name)
        assert secret is not None, (
            f"creating {name} on the dashboard should have created a labelled "
            "Secret, but none carries that name"
        )
        api_key_resources["secret_name"] = secret["metadata"]["name"]
        assert _decoded(secret, "is_active") == "true", (
            "a newly created key should be active, but its Secret held "
            f"{_decoded(secret, 'is_active')!r}"
        )
        assert _decoded(secret, "public_key") == credentials["public_key"], (
            "the stored public key should be the one the dialog showed, but the "
            f"Secret held {_decoded(secret, 'public_key')!r}"
        )
        assert "secret_key" not in secret["data"], (
            "the secret key must never be stored in full, but the Secret carried "
            f"these fields: {sorted(secret['data'])}"
        )

    def test_the_public_key_can_be_copied_from_the_row(
        self, page: Page, api_key_resources: dict
    ):
        name = api_key_resources["name"]
        assert name, "the create test did not record an API key name"

        api_keys = APIKeysPage(page)
        api_keys.navigate_to_api_keys()
        api_keys.wait_for_row(name)

        api_keys.copy_public_key(name)
        assert api_keys.is_copy_confirmed(name), (
            f"copying the public key for {name} should mark that row copied, but the "
            "button kept its original label"
        )

    def test_revoking_deactivates_the_key_without_deleting_its_secret(
        self, page: Page, api_key_resources: dict
    ):
        name = api_key_resources["name"]
        assert name, "the create test did not record an API key name"

        api_keys = APIKeysPage(page)
        api_keys.navigate_to_api_keys()
        api_keys.wait_for_row(name)

        warning = api_keys.open_revoke_dialog(name)
        assert f'Revoke API key "{name}"' in warning, (
            f"the confirmation should name the key being revoked, but read {warning!r}"
        )

        api_keys.confirm_revoke()
        api_keys.wait_for_row_gone(name)
        assert name not in api_keys.listed_names(), (
            f"{name} should no longer be listed once revoked, but the page showed "
            f"{api_keys.listed_names()}"
        )

        secret = _find_api_key_secret(name)
        assert secret is not None, (
            "revoking is a soft delete, so the Secret should still exist after it - "
            f"but the Secret for {name} is gone"
        )
        assert _decoded(secret, "is_active") == "false", (
            "revoking should mark the stored key inactive, but its Secret still held "
            f"is_active={_decoded(secret, 'is_active')!r}"
        )
