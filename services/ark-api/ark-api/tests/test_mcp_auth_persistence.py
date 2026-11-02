"""Tests for ark_api.services.mcp_auth_persistence."""
from __future__ import annotations

import asyncio
import base64
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from kubernetes_asyncio import client
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
    FLOW_AUTH_ID_KEY,
    FLOW_STATE_LABEL,
    FlowState,
    NotATokenSecretError,
    SecretKeys,
    SecretPatchPayload,
    TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS,
    TOKEN_SECRET_LABEL,
    _decode_b64,
    clear_token_secret,
    compute_expires_at,
    delete_token_secret,
    flow_deadline_rfc3339,
    mark_flow_authorized,
    mark_flow_failed,
    now_rfc3339,
    read_cached_client_creds,
    read_flow_state_by_auth_id,
    read_flow_state_by_state_param,
    strip_mcpserver_auth_annotations,
    write_flow_state,
    write_token_secret,
)


def _api_client_cm(v1_mock: MagicMock) -> MagicMock:
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

    def test_from_typed_ref(self):
        ref = MagicMock()
        ref.access_token_key = "at"
        ref.refresh_token_key = "rt"
        ref.expires_at_key = "ea"
        ref.client_id_key = "cid"
        ref.client_secret_key = "csec"
        keys = SecretKeys.from_typed_ref(ref)
        self.assertEqual(keys.access_token, "at")
        self.assertEqual(keys.client_id, "cid")

    def test_from_typed_ref_none_returns_defaults(self):
        keys = SecretKeys.from_typed_ref(None)
        self.assertEqual(keys.access_token, DEFAULT_ACCESS_TOKEN_KEY)


class TestCachedClientCreds(unittest.TestCase):
    def test_both_present_true(self):
        self.assertTrue(CachedClientCreds(client_id="cid", client_secret="csec").both_present)

    def test_both_present_missing_id(self):
        self.assertFalse(CachedClientCreds(client_id=None, client_secret="csec").both_present)

    def test_both_present_missing_secret(self):
        self.assertFalse(CachedClientCreds(client_id="cid", client_secret=None).both_present)

    def test_both_present_blank_strings(self):
        self.assertFalse(CachedClientCreds(client_id="", client_secret="").both_present)


class TestFlowState(unittest.TestCase):
    def test_is_expired_true_when_past_deadline(self):
        flow = FlowState(
            auth_id="a", state_param="s", verifier="v",
            status="pending", message="", expires_at="2020-01-01T00:00:00Z",
            token_expires_at="",
            server_name="srv", namespace="ns",
            client_id="cid", client_secret="csec",
        )
        self.assertTrue(flow.is_expired)

    def test_is_expired_false_when_future_deadline(self):
        flow = FlowState(
            auth_id="a", state_param="s", verifier="v",
            status="pending", message="", expires_at="2099-01-01T00:00:00Z",
            token_expires_at="",
            server_name="srv", namespace="ns",
            client_id="cid", client_secret="csec",
        )
        self.assertFalse(flow.is_expired)

    def test_is_expired_true_when_empty(self):
        flow = FlowState(
            auth_id="a", state_param="s", verifier="v",
            status="pending", message="", expires_at="",
            token_expires_at="",
            server_name="srv", namespace="ns",
            client_id="cid", client_secret="csec",
        )
        self.assertTrue(flow.is_expired)


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


def _stored_secret(*, labels=None, data=None, uid="uid-1") -> client.V1Secret:
    if labels is None:
        labels = {TOKEN_SECRET_LABEL: "true"}
    return client.V1Secret(
        metadata=client.V1ObjectMeta(name="tok", namespace="ns", uid=uid, labels=labels),
        data=data,
    )


def _unlabelled_secret() -> client.V1Secret:
    return _stored_secret(
        labels={"app": "db"},
        data={"password": base64.b64encode(b"hunter2").decode()},
    )


def _core_v1(read=None) -> MagicMock:
    v1 = MagicMock()
    if isinstance(read, Exception):
        v1.read_namespaced_secret = AsyncMock(side_effect=read)
    else:
        v1.read_namespaced_secret = AsyncMock(return_value=read)
    v1.create_namespaced_secret = AsyncMock()
    v1.patch_namespaced_secret = AsyncMock()
    v1.delete_namespaced_secret = AsyncMock()
    v1.list_namespaced_secret = AsyncMock()
    return v1


def _run(v1: MagicMock, coro):
    api_factory, core_factory = _api_client_cm(v1)
    with patch(
        "ark_api.services.mcp_auth_persistence.create_api_client", api_factory
    ), patch("ark_api.services.mcp_auth_persistence.client.CoreV1Api", core_factory):
        return asyncio.run(coro)


def _assert_untouched(v1: MagicMock) -> None:
    v1.create_namespaced_secret.assert_not_called()
    v1.patch_namespaced_secret.assert_not_called()
    v1.delete_namespaced_secret.assert_not_called()


class TestTokenSecretGate(unittest.TestCase):
    def test_error_names_secret_and_label(self):
        err = NotATokenSecretError("ns", "team-db")
        self.assertIn("team-db", str(err))
        self.assertIn(f"{TOKEN_SECRET_LABEL}=true", str(err))
        self.assertIn("tokenSecretRef", str(err))

    def test_label_with_other_value_is_rejected(self):
        v1 = _core_v1(read=_stored_secret(labels={TOKEN_SECRET_LABEL: "false"}))
        with self.assertRaises(NotATokenSecretError):
            _run(v1, read_cached_client_creds("ns", "tok", SecretKeys()))

    def test_secret_without_labels_is_rejected(self):
        v1 = _core_v1(read=_stored_secret(labels={}))
        v1.read_namespaced_secret.return_value.metadata.labels = None
        with self.assertRaises(NotATokenSecretError):
            _run(v1, read_cached_client_creds("ns", "tok", SecretKeys()))


class TestReadCachedClientCreds(unittest.TestCase):
    def test_returns_decoded_creds(self):
        v1 = _core_v1(
            read=_stored_secret(
                data={
                    DEFAULT_CLIENT_ID_KEY: base64.b64encode(b"cid").decode(),
                    DEFAULT_CLIENT_SECRET_KEY: base64.b64encode(b"csec").decode(),
                }
            )
        )

        creds = _run(v1, read_cached_client_creds("ns", "tok-secret", SecretKeys()))

        self.assertEqual(creds.client_id, "cid")
        self.assertEqual(creds.client_secret, "csec")
        v1.read_namespaced_secret.assert_awaited_once_with(name="tok-secret", namespace="ns")

    def test_secret_missing_returns_empty_creds(self):
        v1 = _core_v1(read=ApiException(status=404))

        creds = _run(v1, read_cached_client_creds("ns", "tok-secret", SecretKeys()))

        self.assertIsNone(creds.client_id)
        self.assertIsNone(creds.client_secret)
        self.assertFalse(creds.both_present)

    def test_other_api_exception_propagates(self):
        v1 = _core_v1(read=ApiException(status=500))

        with self.assertRaises(ApiException):
            _run(v1, read_cached_client_creds("ns", "tok-secret", SecretKeys()))

    def test_secret_with_no_data_returns_none(self):
        v1 = _core_v1(read=_stored_secret(data=None))

        creds = _run(v1, read_cached_client_creds("ns", "tok-secret", SecretKeys()))

        self.assertIsNone(creds.client_id)
        self.assertIsNone(creds.client_secret)

    def test_rejects_a_secret_without_the_token_label(self):
        v1 = _core_v1(read=_unlabelled_secret())
        keys = SecretKeys(client_id="password", client_secret="password")

        with self.assertRaises(NotATokenSecretError):
            _run(v1, read_cached_client_creds("ns", "team-db", keys))


class TestWriteFlowState(unittest.TestCase):
    def _write(self, v1: MagicMock):
        return _run(
            v1,
            write_flow_state(
                namespace="ns",
                secret_name="tok",
                auth_id="aid",
                state_param="st",
                verifier="ver",
                expires_at="2030-01-01T00:00:00Z",
                server_name="srv",
                client_id="cid",
                client_secret="csec",
                keys=SecretKeys(),
            ),
        )

    def test_create_path_labels_the_secret(self):
        v1 = _core_v1()

        self._write(v1)

        body = v1.create_namespaced_secret.await_args.kwargs["body"]
        self.assertEqual(body.metadata.labels[TOKEN_SECRET_LABEL], "true")
        self.assertEqual(body.metadata.labels[FLOW_STATE_LABEL], "st")
        v1.read_namespaced_secret.assert_not_called()
        v1.patch_namespaced_secret.assert_not_called()

    def test_existing_labelled_secret_is_patched_with_uid_precondition(self):
        v1 = _core_v1(read=_stored_secret(uid="uid-42"))
        v1.create_namespaced_secret.side_effect = ApiException(status=409)

        self._write(v1)

        body = v1.patch_namespaced_secret.await_args.kwargs["body"]
        self.assertEqual(body["metadata"]["uid"], "uid-42")
        self.assertEqual(body["metadata"]["labels"][FLOW_STATE_LABEL], "st")
        self.assertEqual(body["stringData"][FLOW_AUTH_ID_KEY], "aid")

    def test_rejects_a_secret_without_the_token_label(self):
        v1 = _core_v1(read=_unlabelled_secret())
        v1.create_namespaced_secret.side_effect = ApiException(status=409)

        with self.assertRaises(NotATokenSecretError):
            self._write(v1)

        v1.patch_namespaced_secret.assert_not_called()


class TestReadFlowState(unittest.TestCase):
    def _flow_secret(self, labels=None) -> client.V1Secret:
        return _stored_secret(
            labels=labels,
            data={FLOW_AUTH_ID_KEY: base64.b64encode(b"aid").decode()},
        )

    def test_by_state_param_selects_only_token_secrets(self):
        v1 = _core_v1()
        v1.list_namespaced_secret.return_value = MagicMock(items=[self._flow_secret()])

        flow = _run(v1, read_flow_state_by_state_param("ns", "st"))

        self.assertEqual(flow.auth_id, "aid")
        self.assertEqual(flow.secret_name, "tok")
        selector = v1.list_namespaced_secret.await_args.kwargs["label_selector"]
        self.assertEqual(selector, f"{TOKEN_SECRET_LABEL}=true,{FLOW_STATE_LABEL}=st")

    def test_by_auth_id_returns_flow_from_labelled_secret(self):
        v1 = _core_v1(read=self._flow_secret())

        flow = _run(v1, read_flow_state_by_auth_id("ns", "tok"))

        self.assertEqual(flow.auth_id, "aid")

    def test_by_auth_id_missing_secret_returns_none(self):
        v1 = _core_v1(read=ApiException(status=404))

        self.assertIsNone(_run(v1, read_flow_state_by_auth_id("ns", "tok")))

    def test_by_auth_id_rejects_a_secret_without_the_token_label(self):
        v1 = _core_v1(read=self._flow_secret(labels={"app": "db"}))

        with self.assertRaises(NotATokenSecretError):
            _run(v1, read_flow_state_by_auth_id("ns", "tok"))


class TestMarkFlow(unittest.TestCase):
    def _cases(self):
        return [
            ("authorized", lambda: mark_flow_authorized("ns", "tok", "2030-01-01T00:00:00Z")),
            ("failed", lambda: mark_flow_failed("ns", "tok", "denied")),
        ]

    def test_labelled_secret_is_patched_with_uid_precondition(self):
        for status, call in self._cases():
            with self.subTest(status=status):
                v1 = _core_v1(read=_stored_secret(uid="uid-7"))

                _run(v1, call())

                body = v1.patch_namespaced_secret.await_args.kwargs["body"]
                self.assertEqual(body["metadata"]["uid"], "uid-7")
                self.assertIsNone(body["metadata"]["labels"][FLOW_STATE_LABEL])
                self.assertEqual(body["stringData"]["_flow_status"], status)

    def test_rejects_a_secret_without_the_token_label(self):
        for status, call in self._cases():
            with self.subTest(status=status):
                v1 = _core_v1(read=_unlabelled_secret())

                with self.assertRaises(NotATokenSecretError):
                    _run(v1, call())

                _assert_untouched(v1)

    def test_missing_secret_raises_not_found(self):
        for status, call in self._cases():
            with self.subTest(status=status):
                v1 = _core_v1(read=ApiException(status=404))

                with self.assertRaises(ApiException) as ctx:
                    _run(v1, call())

                self.assertEqual(ctx.exception.status, 404)
                _assert_untouched(v1)


class TestComputeExpiresAt(unittest.TestCase):
    def test_none_returns_none(self):
        self.assertIsNone(compute_expires_at(None))

    def test_zero_returns_none(self):
        self.assertIsNone(compute_expires_at(0))

    def test_negative_returns_none(self):
        self.assertIsNone(compute_expires_at(-30))

    def test_positive_subtracts_safety_margin(self):
        now = datetime(2030, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        result = compute_expires_at(3600, now=now)
        self.assertEqual(result, "2030-01-01T00:59:30Z")

    def test_uses_now_default_when_omitted(self):
        result = compute_expires_at(3600)
        self.assertIsNotNone(result)
        self.assertTrue(result.endswith("Z"))


class TestTokenExpirySafetyMargin(unittest.TestCase):
    def test_constant_is_30(self):
        self.assertEqual(TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS, 30)


class TestWriteTokenSecret(unittest.TestCase):
    def _payload(self, *, refresh_token=None, expires_at=None) -> SecretPatchPayload:
        return SecretPatchPayload(
            access_token="at",
            refresh_token=refresh_token,
            expires_at=expires_at,
            client_id="cid",
            client_secret="csec",
        )

    def _write(self, v1: MagicMock, **payload):
        return _run(
            v1,
            write_token_secret(
                namespace="ns",
                secret_name="tok",
                keys=SecretKeys(),
                payload=self._payload(**payload),
            ),
        )

    def test_create_path(self):
        v1 = _core_v1()

        self._write(v1, refresh_token="rt", expires_at="2030-01-01T00:00:00Z")

        v1.create_namespaced_secret.assert_awaited_once()
        v1.patch_namespaced_secret.assert_not_called()
        v1.read_namespaced_secret.assert_not_called()
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

    def test_409_falls_back_to_patch(self):
        v1 = _core_v1(read=_stored_secret(uid="uid-9"))
        v1.create_namespaced_secret.side_effect = ApiException(status=409)

        self._write(v1, refresh_token="rt", expires_at="t")

        v1.create_namespaced_secret.assert_awaited_once()
        v1.patch_namespaced_secret.assert_awaited_once()
        body = v1.patch_namespaced_secret.await_args.kwargs["body"]
        self.assertEqual(body["metadata"]["uid"], "uid-9")
        self.assertEqual(body["stringData"]["access_token"], "at")

    def test_rejects_a_secret_without_the_token_label(self):
        v1 = _core_v1(read=_unlabelled_secret())
        v1.create_namespaced_secret.side_effect = ApiException(status=409)

        with self.assertRaises(NotATokenSecretError):
            self._write(v1)

        v1.patch_namespaced_secret.assert_not_called()

    def test_secret_gone_after_conflict_raises_not_found(self):
        v1 = _core_v1(read=ApiException(status=404))
        v1.create_namespaced_secret.side_effect = ApiException(status=409)

        with self.assertRaises(ApiException) as ctx:
            self._write(v1)

        self.assertEqual(ctx.exception.status, 404)
        v1.patch_namespaced_secret.assert_not_called()


class TestClearTokenSecret(unittest.TestCase):
    def _clear(self, v1: MagicMock, *, keep_client: bool):
        return _run(
            v1,
            clear_token_secret(
                namespace="ns",
                secret_name="tok",
                keys=SecretKeys(),
                keep_client=keep_client,
            ),
        )

    def test_default_clears_token_and_flow_keys(self):
        v1 = _core_v1(read=_stored_secret(uid="uid-3"))

        cleared = self._clear(v1, keep_client=False)

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
        self.assertEqual(body["metadata"]["uid"], "uid-3")

    def test_keep_client_clears_three_keys(self):
        v1 = _core_v1(read=_stored_secret())

        cleared = self._clear(v1, keep_client=True)

        self.assertEqual(
            set(cleared),
            {DEFAULT_ACCESS_TOKEN_KEY, DEFAULT_REFRESH_TOKEN_KEY, DEFAULT_EXPIRES_AT_KEY},
        )

    def test_missing_secret_returns_none(self):
        v1 = _core_v1(read=ApiException(status=404))

        self.assertIsNone(self._clear(v1, keep_client=False))
        v1.patch_namespaced_secret.assert_not_called()

    def test_secret_gone_before_patch_returns_none(self):
        v1 = _core_v1(read=_stored_secret())
        v1.patch_namespaced_secret.side_effect = ApiException(status=404)

        self.assertIsNone(self._clear(v1, keep_client=False))

    def test_rejects_a_secret_without_the_token_label(self):
        for keep_client in (False, True):
            with self.subTest(keep_client=keep_client):
                v1 = _core_v1(read=_unlabelled_secret())

                with self.assertRaises(NotATokenSecretError):
                    self._clear(v1, keep_client=keep_client)

                _assert_untouched(v1)


class TestDeleteTokenSecret(unittest.TestCase):
    def test_delete_success_returns_true(self):
        v1 = _core_v1(read=_stored_secret(uid="uid-5"))

        result = _run(v1, delete_token_secret(namespace="ns", secret_name="tok"))

        self.assertTrue(result)
        kwargs = v1.delete_namespaced_secret.await_args.kwargs
        self.assertEqual(kwargs["name"], "tok")
        self.assertEqual(kwargs["namespace"], "ns")
        self.assertEqual(kwargs["body"].preconditions.uid, "uid-5")

    def test_delete_404_returns_false(self):
        v1 = _core_v1(read=_stored_secret())
        v1.delete_namespaced_secret.side_effect = ApiException(status=404)

        result = _run(v1, delete_token_secret(namespace="ns", secret_name="tok"))

        self.assertFalse(result)

    def test_missing_secret_returns_false_without_delete(self):
        v1 = _core_v1(read=ApiException(status=404))

        result = _run(v1, delete_token_secret(namespace="ns", secret_name="tok"))

        self.assertFalse(result)
        v1.delete_namespaced_secret.assert_not_called()

    def test_rejects_a_secret_without_the_token_label(self):
        v1 = _core_v1(read=_unlabelled_secret())

        with self.assertRaises(NotATokenSecretError):
            _run(v1, delete_token_secret(namespace="ns", secret_name="team-db"))

        _assert_untouched(v1)


class TestNowRfc3339(unittest.TestCase):
    def test_format_is_rfc3339_utc(self):
        result = now_rfc3339()
        self.assertEqual(len(result), 20)
        self.assertTrue(result.endswith("Z"))
        datetime.strptime(result, "%Y-%m-%dT%H:%M:%SZ")


class TestFlowDeadlineRfc3339(unittest.TestCase):
    def test_returns_future_timestamp(self):
        result = flow_deadline_rfc3339(600)
        self.assertTrue(result.endswith("Z"))
        deadline = datetime.strptime(result, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        self.assertGreater(deadline, datetime.now(timezone.utc))


def _ark_client_with_mcp(mcp_dict: dict):
    ark_client = MagicMock()
    mcp = MagicMock()
    mcp.to_dict.return_value = mcp_dict
    ark_client.mcpservers.a_get = AsyncMock(return_value=mcp)
    ark_client.mcpservers.a_update = AsyncMock()
    return ark_client


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
            "ark_api.services.mcp_auth_persistence.MCPServerV1alpha1",
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


if __name__ == "__main__":
    unittest.main()
