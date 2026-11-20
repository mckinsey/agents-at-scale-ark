import re
import unittest

from src.ark_api.marketplace_install import constants
from kubernetes_asyncio.client.rest import ApiException

from src.ark_api.marketplace_install.errors import describe_error, install_error


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

    def test_describe_error_keeps_api_responses_out_of_logs(self):
        error = ApiException(status=500, reason="Internal Server Error")
        error.body = '{"secret": "value"}'
        error.headers = {"Authorization": "Bearer token"}
        self.assertEqual(describe_error(error), "500 Internal Server Error")
        self.assertEqual(describe_error(RuntimeError("detail")), "RuntimeError: detail")


if __name__ == "__main__":
    unittest.main()
