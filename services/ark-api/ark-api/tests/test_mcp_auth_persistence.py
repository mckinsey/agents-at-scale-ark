"""Tests for ark_api.services.mcp_auth_persistence."""
from __future__ import annotations

import asyncio
import base64
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from kubernetes_asyncio.client.rest import ApiException

from ark_api.services.mcp_auth_persistence import (
    ANNOTATION_AUTHORIZED_AT,
    ANNOTATION_AUTHORIZED_BY,
    CachedClientCreds,
    DEFAULT_ACCESS_TOKEN_KEY,
    DEFAULT_CLIENT_ID_KEY,
    DEFAULT_CLIENT_SECRET_KEY,
    DEFAULT_EXPIRES_AT_KEY,
    DEFAULT_REFRESH_TOKEN_KEY,
    SecretKeys,
    SecretPatchPayload,
    TOKEN_SECRET_LABEL,
    _decode_b64,
    annotate_mcpserver_authorized,
    clear_token_secret,
    compute_expires_at,
    delete_token_secret,
    now_rfc3339,
    read_cached_client_creds,
    strip_mcpserver_auth_annotations,
    write_token_secret,
)


def _api_client_cm(v1_mock: MagicMock) -> MagicMock:
    """Build an ApiClient() factory that returns an async-context-manager whose
    body sees a CoreV1Api wrapped around `v1_mock`.

    Caller patches `ApiClient` with the returned MagicMock and `client.CoreV1Api`
    with a MagicMock returning `v1_mock`.
    """
    cm = AsyncMock()
    cm.__aenter__.return_value = MagicMock()
    cm.__aexit__.return_value = None
    api_client_factory = MagicMock(return_value=cm)
    core_v1_api_factory = MagicMock(return_value=v1_mock)
    return api_client_factory, core_v1_api_factory


class TestSecretKeys(unittest.TestCase):
    def test_default_keys(self):
        keys = SecretKeys()
        self.assertEqual(keys.access_token, DEFAULT_ACCESS_TOKEN_KEY)
        self.assertEqual(keys.refresh_token, DEFAULT_REFRESH_TOKEN_KEY)
        self.assertEqual(keys.expires_at, DEFAULT_EXPIRES_AT_KEY)
        self.assertEqual(keys.client_id, DEFAULT_CLIENT_ID_KEY)
        self.assertEqual(keys.client_secret, DEFAULT_CLIENT_SECRET_KEY)

    def test_from_token_secret_ref_none_returns_defaults(self):
        keys = SecretKeys.from_token_secret_ref(None)
        self.assertEqual(keys.access_token, DEFAULT_ACCESS_TOKEN_KEY)

    def test_from_token_secret_ref_empty_dict_returns_defaults(self):
        keys = SecretKeys.from_token_secret_ref({})
        self.assertEqual(keys.access_token, DEFAULT_ACCESS_TOKEN_KEY)
        self.assertEqual(keys.client_id, DEFAULT_CLIENT_ID_KEY)

    def test_from_token_secret_ref_overrides_keys(self):
        keys = SecretKeys.from_token_secret_ref(
            {
                "name": "irrelevant",
                "accessTokenKey": "at",
                "refreshTokenKey": "rt",
                "expiresAtKey": "ea",
                "clientIDKey": "cid",
                "clientSecretKey": "csec",
            }
        )
        self.assertEqual(keys.access_token, "at")
        self.assertEqual(keys.refresh_token, "rt")
        self.assertEqual(keys.expires_at, "ea")
        self.assertEqual(keys.client_id, "cid")
        self.assertEqual(keys.client_secret, "csec")

    def test_from_token_secret_ref_blank_key_falls_back_to_default(self):
        keys = SecretKeys.from_token_secret_ref({"accessTokenKey": ""})
        self.assertEqual(keys.access_token, DEFAULT_ACCESS_TOKEN_KEY)

    def test_as_list_order_matches_struct(self):
        keys = SecretKeys(
            access_token="a",
            refresh_token="b",
            expires_at="c",
            client_id="d",
            client_secret="e",
        )
        self.assertEqual(keys.as_list(), ["a", "b", "c", "d", "e"])


class TestCachedClientCreds(unittest.TestCase):
    def test_both_present_true(self):
        self.assertTrue(CachedClientCreds(client_id="cid", client_secret="csec").both_present)

    def test_both_present_missing_id(self):
        self.assertFalse(CachedClientCreds(client_id=None, client_secret="csec").both_present)

    def test_both_present_missing_secret(self):
        self.assertFalse(CachedClientCreds(client_id="cid", client_secret=None).both_present)

    def test_both_present_blank_strings(self):
        self.assertFalse(CachedClientCreds(client_id="", client_secret="").both_present)


class TestDecodeB64(unittest.TestCase):
    def test_none_returns_none(self):
        self.assertIsNone(_decode_b64(None))

    def test_valid_b64_decodes(self):
        encoded = base64.b64encode(b"hello").decode("ascii")
        self.assertEqual(_decode_b64(encoded), "hello")

    def test_invalid_b64_returns_none(self):
        self.assertIsNone(_decode_b64("!!! not b64 !!!"))

    def test_invalid_utf8_returns_none(self):
        encoded = base64.b64encode(b"\xff\xfe\xfd").decode("ascii")
        self.assertIsNone(_decode_b64(encoded))


class TestReadCachedClientCreds(unittest.TestCase):
    def test_returns_decoded_creds(self):
        secret = MagicMock()
        secret.data = {
            DEFAULT_CLIENT_ID_KEY: base64.b64encode(b"cid").decode(),
            DEFAULT_CLIENT_SECRET_KEY: base64.b64encode(b"csec").decode(),
        }
        v1 = MagicMock()
        v1.read_namespaced_secret = AsyncMock(return_value=secret)
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            creds = asyncio.run(
                read_cached_client_creds("ns", "tok-secret", SecretKeys())
            )

        self.assertEqual(creds.client_id, "cid")
        self.assertEqual(creds.client_secret, "csec")
        v1.read_namespaced_secret.assert_awaited_once_with(name="tok-secret", namespace="ns")

    def test_secret_missing_returns_empty_creds(self):
        v1 = MagicMock()
        v1.read_namespaced_secret = AsyncMock(side_effect=ApiException(status=404))
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            creds = asyncio.run(
                read_cached_client_creds("ns", "tok-secret", SecretKeys())
            )

        self.assertIsNone(creds.client_id)
        self.assertIsNone(creds.client_secret)
        self.assertFalse(creds.both_present)

    def test_other_api_exception_propagates(self):
        v1 = MagicMock()
        v1.read_namespaced_secret = AsyncMock(side_effect=ApiException(status=500))
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            with self.assertRaises(ApiException):
                asyncio.run(read_cached_client_creds("ns", "tok-secret", SecretKeys()))

    def test_secret_with_no_data_returns_none(self):
        secret = MagicMock()
        secret.data = None
        v1 = MagicMock()
        v1.read_namespaced_secret = AsyncMock(return_value=secret)
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            creds = asyncio.run(
                read_cached_client_creds("ns", "tok-secret", SecretKeys())
            )

        self.assertIsNone(creds.client_id)
        self.assertIsNone(creds.client_secret)

    def test_respects_custom_keys(self):
        secret = MagicMock()
        secret.data = {
            "custom_cid": base64.b64encode(b"x").decode(),
            "custom_csec": base64.b64encode(b"y").decode(),
        }
        v1 = MagicMock()
        v1.read_namespaced_secret = AsyncMock(return_value=secret)
        api_factory, core_factory = _api_client_cm(v1)

        keys = SecretKeys(client_id="custom_cid", client_secret="custom_csec")
        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            creds = asyncio.run(read_cached_client_creds("ns", "s", keys))

        self.assertEqual(creds.client_id, "x")
        self.assertEqual(creds.client_secret, "y")


class TestComputeExpiresAt(unittest.TestCase):
    def test_none_returns_none(self):
        self.assertIsNone(compute_expires_at(None))

    def test_zero_returns_none(self):
        self.assertIsNone(compute_expires_at(0))

    def test_negative_returns_none(self):
        self.assertIsNone(compute_expires_at(-30))

    def test_positive_subtracts_30s_skew(self):
        now = datetime(2030, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        result = compute_expires_at(3600, now=now)
        self.assertEqual(result, "2030-01-01T00:59:30Z")

    def test_uses_now_default_when_omitted(self):
        result = compute_expires_at(3600)
        self.assertIsNotNone(result)
        self.assertTrue(result.endswith("Z"))


class TestWriteTokenSecret(unittest.TestCase):
    def _payload(self, *, refresh_token=None, expires_at=None) -> SecretPatchPayload:
        return SecretPatchPayload(
            access_token="at",
            refresh_token=refresh_token,
            expires_at=expires_at,
            client_id="cid",
            client_secret="csec",
        )

    def _setup(self):
        v1 = MagicMock()
        return v1, *_api_client_cm(v1)

    def test_create_path(self):
        v1, api_factory, core_factory = self._setup()
        v1.create_namespaced_secret = AsyncMock()
        v1.patch_namespaced_secret = AsyncMock()

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            asyncio.run(
                write_token_secret(
                    namespace="ns",
                    secret_name="tok",
                    keys=SecretKeys(),
                    payload=self._payload(refresh_token="rt", expires_at="2030-01-01T00:00:00Z"),
                )
            )

        v1.create_namespaced_secret.assert_awaited_once()
        v1.patch_namespaced_secret.assert_not_called()
        kwargs = v1.create_namespaced_secret.await_args.kwargs
        body = kwargs["body"]
        self.assertEqual(kwargs["namespace"], "ns")
        self.assertEqual(body.metadata.name, "tok")
        self.assertEqual(body.metadata.labels[TOKEN_SECRET_LABEL], "true")
        self.assertEqual(body.string_data["access_token"], "at")
        self.assertEqual(body.string_data["refresh_token"], "rt")
        self.assertEqual(body.string_data["expires_at"], "2030-01-01T00:00:00Z")
        self.assertEqual(body.string_data["client_id"], "cid")
        self.assertEqual(body.string_data["client_secret"], "csec")
        self.assertEqual(body.type, "Opaque")

    def test_create_omits_refresh_token_when_none(self):
        v1, api_factory, core_factory = self._setup()
        v1.create_namespaced_secret = AsyncMock()

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            asyncio.run(
                write_token_secret(
                    namespace="ns",
                    secret_name="tok",
                    keys=SecretKeys(),
                    payload=self._payload(refresh_token=None, expires_at=None),
                )
            )

        body = v1.create_namespaced_secret.await_args.kwargs["body"]
        self.assertNotIn("refresh_token", body.string_data)
        self.assertNotIn("expires_at", body.string_data)

    def test_409_falls_back_to_patch(self):
        v1, api_factory, core_factory = self._setup()
        v1.create_namespaced_secret = AsyncMock(side_effect=ApiException(status=409))
        v1.patch_namespaced_secret = AsyncMock()

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            asyncio.run(
                write_token_secret(
                    namespace="ns",
                    secret_name="tok",
                    keys=SecretKeys(),
                    payload=self._payload(refresh_token="rt", expires_at="t"),
                )
            )

        v1.create_namespaced_secret.assert_awaited_once()
        v1.patch_namespaced_secret.assert_awaited_once()
        kwargs = v1.patch_namespaced_secret.await_args.kwargs
        self.assertEqual(kwargs["name"], "tok")
        self.assertEqual(kwargs["namespace"], "ns")
        body = kwargs["body"]
        self.assertEqual(body["metadata"]["labels"][TOKEN_SECRET_LABEL], "true")
        self.assertEqual(body["stringData"]["access_token"], "at")
        self.assertEqual(body["stringData"]["refresh_token"], "rt")
        self.assertEqual(body["stringData"]["expires_at"], "t")

    def test_non_409_create_error_propagates(self):
        v1, api_factory, core_factory = self._setup()
        v1.create_namespaced_secret = AsyncMock(side_effect=ApiException(status=403))
        v1.patch_namespaced_secret = AsyncMock()

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            with self.assertRaises(ApiException):
                asyncio.run(
                    write_token_secret(
                        namespace="ns",
                        secret_name="tok",
                        keys=SecretKeys(),
                        payload=self._payload(refresh_token=None, expires_at=None),
                    )
                )

        v1.patch_namespaced_secret.assert_not_called()

    def test_respects_custom_keys(self):
        v1, api_factory, core_factory = self._setup()
        v1.create_namespaced_secret = AsyncMock()

        keys = SecretKeys(
            access_token="AT",
            refresh_token="RT",
            expires_at="EA",
            client_id="CID",
            client_secret="CSEC",
        )
        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            asyncio.run(
                write_token_secret(
                    namespace="ns",
                    secret_name="tok",
                    keys=keys,
                    payload=self._payload(refresh_token="r", expires_at="e"),
                )
            )

        body = v1.create_namespaced_secret.await_args.kwargs["body"]
        self.assertEqual(body.string_data["AT"], "at")
        self.assertEqual(body.string_data["RT"], "r")
        self.assertEqual(body.string_data["EA"], "e")
        self.assertEqual(body.string_data["CID"], "cid")
        self.assertEqual(body.string_data["CSEC"], "csec")


class TestClearTokenSecret(unittest.TestCase):
    def test_default_clears_five_keys(self):
        v1 = MagicMock()
        v1.patch_namespaced_secret = AsyncMock()
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            cleared = asyncio.run(
                clear_token_secret(
                    namespace="ns",
                    secret_name="tok",
                    keys=SecretKeys(),
                    keep_client=False,
                )
            )

        self.assertEqual(
            set(cleared),
            {
                DEFAULT_ACCESS_TOKEN_KEY,
                DEFAULT_REFRESH_TOKEN_KEY,
                DEFAULT_EXPIRES_AT_KEY,
                DEFAULT_CLIENT_ID_KEY,
                DEFAULT_CLIENT_SECRET_KEY,
            },
        )
        body = v1.patch_namespaced_secret.await_args.kwargs["body"]
        self.assertEqual(body["stringData"][DEFAULT_ACCESS_TOKEN_KEY], "")

    def test_keep_client_clears_three_keys(self):
        v1 = MagicMock()
        v1.patch_namespaced_secret = AsyncMock()
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            cleared = asyncio.run(
                clear_token_secret(
                    namespace="ns",
                    secret_name="tok",
                    keys=SecretKeys(),
                    keep_client=True,
                )
            )

        self.assertEqual(
            set(cleared),
            {DEFAULT_ACCESS_TOKEN_KEY, DEFAULT_REFRESH_TOKEN_KEY, DEFAULT_EXPIRES_AT_KEY},
        )

    def test_missing_secret_returns_none(self):
        v1 = MagicMock()
        v1.patch_namespaced_secret = AsyncMock(side_effect=ApiException(status=404))
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            cleared = asyncio.run(
                clear_token_secret(
                    namespace="ns",
                    secret_name="tok",
                    keys=SecretKeys(),
                    keep_client=False,
                )
            )

        self.assertIsNone(cleared)

    def test_other_api_exception_propagates(self):
        v1 = MagicMock()
        v1.patch_namespaced_secret = AsyncMock(side_effect=ApiException(status=500))
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            with self.assertRaises(ApiException):
                asyncio.run(
                    clear_token_secret(
                        namespace="ns",
                        secret_name="tok",
                        keys=SecretKeys(),
                        keep_client=False,
                    )
                )


class TestDeleteTokenSecret(unittest.TestCase):
    def test_delete_success_returns_true(self):
        v1 = MagicMock()
        v1.delete_namespaced_secret = AsyncMock()
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            result = asyncio.run(delete_token_secret(namespace="ns", secret_name="tok"))

        self.assertTrue(result)
        v1.delete_namespaced_secret.assert_awaited_once_with(name="tok", namespace="ns")

    def test_delete_404_returns_false(self):
        v1 = MagicMock()
        v1.delete_namespaced_secret = AsyncMock(side_effect=ApiException(status=404))
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            result = asyncio.run(delete_token_secret(namespace="ns", secret_name="tok"))

        self.assertFalse(result)

    def test_delete_other_api_exception_propagates(self):
        v1 = MagicMock()
        v1.delete_namespaced_secret = AsyncMock(side_effect=ApiException(status=403))
        api_factory, core_factory = _api_client_cm(v1)

        with patch(
            "ark_api.services.mcp_auth_persistence.ApiClient", api_factory
        ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
            with self.assertRaises(ApiException):
                asyncio.run(delete_token_secret(namespace="ns", secret_name="tok"))


class TestNowRfc3339(unittest.TestCase):
    def test_format_is_rfc3339_utc(self):
        result = now_rfc3339()
        self.assertEqual(len(result), 20)
        self.assertTrue(result.endswith("Z"))
        datetime.strptime(result, "%Y-%m-%dT%H:%M:%SZ")


def _ark_client_with_mcp(mcp_dict: dict):
    ark_client = MagicMock()
    mcp = MagicMock()
    mcp.to_dict.return_value = mcp_dict
    ark_client.mcpservers.a_get = AsyncMock(return_value=mcp)
    ark_client.mcpservers.a_update = AsyncMock()
    return ark_client


class TestAnnotateMcpServerAuthorized(unittest.TestCase):
    def test_adds_both_annotations_when_metadata_absent(self):
        mcp_dict = {"spec": {}, "status": {}}
        ark_client = _ark_client_with_mcp(mcp_dict)

        with patch(
            "ark_sdk.models.mcp_server_v1alpha1.MCPServerV1alpha1",
            new=lambda **kw: kw,
        ):
            asyncio.run(annotate_mcpserver_authorized(ark_client, "notion", "cli"))

        ark_client.mcpservers.a_update.assert_awaited_once()
        updated = ark_client.mcpservers.a_update.await_args.args[0]
        annotations = updated["metadata"]["annotations"]
        self.assertEqual(annotations[ANNOTATION_AUTHORIZED_BY], "cli")
        self.assertIn(ANNOTATION_AUTHORIZED_AT, annotations)

    def test_merges_with_existing_annotations(self):
        mcp_dict = {
            "metadata": {"annotations": {"existing": "value"}},
            "spec": {},
            "status": {},
        }
        ark_client = _ark_client_with_mcp(mcp_dict)

        with patch(
            "ark_sdk.models.mcp_server_v1alpha1.MCPServerV1alpha1",
            new=lambda **kw: kw,
        ):
            asyncio.run(annotate_mcpserver_authorized(ark_client, "notion", "alice"))

        annotations = ark_client.mcpservers.a_update.await_args.args[0]["metadata"][
            "annotations"
        ]
        self.assertEqual(annotations["existing"], "value")
        self.assertEqual(annotations[ANNOTATION_AUTHORIZED_BY], "alice")


class TestStripMcpServerAuthAnnotations(unittest.TestCase):
    def test_removes_both_annotations(self):
        mcp_dict = {
            "metadata": {
                "annotations": {
                    ANNOTATION_AUTHORIZED_BY: "cli",
                    ANNOTATION_AUTHORIZED_AT: "2030-01-01T00:00:00Z",
                    "kept": "v",
                }
            },
            "spec": {},
            "status": {},
        }
        ark_client = _ark_client_with_mcp(mcp_dict)

        with patch(
            "ark_sdk.models.mcp_server_v1alpha1.MCPServerV1alpha1",
            new=lambda **kw: kw,
        ):
            asyncio.run(strip_mcpserver_auth_annotations(ark_client, "notion"))

        annotations = ark_client.mcpservers.a_update.await_args.args[0]["metadata"][
            "annotations"
        ]
        self.assertNotIn(ANNOTATION_AUTHORIZED_BY, annotations)
        self.assertNotIn(ANNOTATION_AUTHORIZED_AT, annotations)
        self.assertEqual(annotations["kept"], "v")

    def test_noop_when_no_matching_annotations(self):
        mcp_dict = {
            "metadata": {"annotations": {"other": "v"}},
            "spec": {},
            "status": {},
        }
        ark_client = _ark_client_with_mcp(mcp_dict)

        asyncio.run(strip_mcpserver_auth_annotations(ark_client, "notion"))

        ark_client.mcpservers.a_update.assert_not_called()

    def test_noop_when_metadata_missing(self):
        ark_client = _ark_client_with_mcp({"spec": {}, "status": {}})

        asyncio.run(strip_mcpserver_auth_annotations(ark_client, "notion"))

        ark_client.mcpservers.a_update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
