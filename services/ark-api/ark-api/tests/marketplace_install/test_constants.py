import re
import unittest

from src.ark_api.marketplace_install import constants
from kubernetes_asyncio.client.rest import ApiException

from src.ark_api.marketplace_install.errors import describe_error, install_error
from src.ark_api.models.marketplace_installs import MarketplaceInstallRecord


class TestSharedNames(unittest.TestCase):
    def test_names_created_by_the_tenant_chart(self):
        self.assertEqual(constants.ARK_GROUP, "ark.mckinsey.com")
        self.assertEqual(constants.INSTALL_RESOURCE, "marketplaceinstalls")
        self.assertEqual(constants.INSTALL_VERB, "create")
        self.assertEqual(constants.INSTALLER_SERVICE_ACCOUNT, "ark-marketplace-installer")

    def test_installer_username(self):
        self.assertEqual(
            constants.installer_username("team-a"),
            "system:serviceaccount:team-a:ark-marketplace-installer",
        )

    def test_policy_names(self):
        self.assertEqual(
            constants.policy_names("team-a"),
            (
                "ark-marketplace-installer-sa-team-a",
                "ark-marketplace-installer-sa-team-a-bootstrap",
            ),
        )


    def test_lock_and_job_names_shared_with_the_tenant_chart(self):
        self.assertEqual(constants.LOCK_NAME, "marketplace-install-lock")
        self.assertEqual(constants.INSTALL_LABEL, "ark.mckinsey.com/marketplace-install")

    def test_job_name_keeps_short_releases(self):
        self.assertEqual(constants.job_name("phoenix"), "marketplace-install-phoenix")
        self.assertEqual(len(constants.job_name("a" * 43)), 63)
        self.assertEqual(constants.job_name("a" * 43), "marketplace-install-" + "a" * 43)

    def test_job_name_hashes_long_releases(self):
        first = constants.job_name("a" * 52 + "b")
        second = constants.job_name("a" * 52 + "c")
        self.assertLessEqual(len(first), 63)
        self.assertNotEqual(first, second)
        self.assertEqual(first, constants.job_name("a" * 52 + "b"))
        self.assertRegex(first, r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")

    def test_job_name_does_not_leave_a_dash_before_the_hash(self):
        name = constants.job_name("a" * 42 + "-" + "b" * 10)
        self.assertNotIn("--", name)
        self.assertLessEqual(len(name), 63)

    def test_namespace_pattern_is_a_dns_label(self):
        for name in ("team-a", "a", "a" * 63, "0team"):
            self.assertRegex(name, constants.NAMESPACE_PATTERN)
        for name in ("a:b", "Team", "-a", "a-", "a.b", "a" * 64, "", "a/b"):
            self.assertIsNone(re.match(constants.NAMESPACE_PATTERN, name), name)


class TestInstallError(unittest.TestCase):
    def test_detail_carries_code_and_message(self):
        error = install_error(403, "not-permitted", "nope")
        self.assertEqual(error.status_code, 403)
        self.assertEqual(error.detail, {"code": "not-permitted", "message": "nope"})

    def test_detail_carries_the_record_when_given(self):
        record = MarketplaceInstallRecord(release="demo", state="installed", itemName="demo")
        error = install_error(409, "already-installed", "present", record=record)
        self.assertEqual(error.detail["record"]["state"], "installed")
        self.assertEqual(error.detail["record"]["itemName"], "demo")
        self.assertIsNone(error.detail["record"]["log"])
        self.assertEqual(error.detail["record"]["events"], [])

    def test_describe_error_keeps_api_responses_out_of_logs(self):
        error = ApiException(status=500, reason="Internal Server Error")
        error.body = '{"secret": "value"}'
        error.headers = {"Authorization": "Bearer token"}
        self.assertEqual(describe_error(error), "500 Internal Server Error")
        self.assertEqual(describe_error(RuntimeError("detail")), "RuntimeError: detail")


if __name__ == "__main__":
    unittest.main()
