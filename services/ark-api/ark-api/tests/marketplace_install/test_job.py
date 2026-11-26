import os
import unittest
from unittest.mock import patch

from src.ark_api.marketplace_install import job

DIGEST = "sha256:" + "a" * 64
IMAGE = "ghcr.io/mckinsey/agents-at-scale-ark/ark-api:1.2.3"


def _spec(**fields):
    values = {
        "namespace": "team-a",
        "source": "official",
        "item": "phoenix",
        "release": "phoenix",
        "chart_ref": "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix",
        "digest": DIGEST,
        "chart_version": "0.1.12",
        "plain_http": False,
        "installed_by": "alice@example.com",
    }
    values.update(fields)
    return job.InstallSpec(**values)


class TestArgv(unittest.TestCase):
    def setUp(self):
        patcher = patch.dict(os.environ, {}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_exact_command(self):
        self.assertEqual(
            job.argv(_spec()),
            [
                "timeout", "-k", "10", "--signal=TERM", "660",
                "helm", "install", "phoenix",
                f"oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix@{DIGEST}",
                "--namespace", "team-a", "--wait", "--timeout", "600s", "--skip-crds",
                "--description", "installed-by=alice@example.com",
            ],
        )

    def test_plain_http_only_when_asked(self):
        self.assertNotIn("--plain-http", job.argv(_spec()))
        self.assertIn("--plain-http", job.argv(_spec(plain_http=True)))

    def test_no_description_without_a_user(self):
        args = job.argv(_spec(installed_by=None))
        self.assertNotIn("--description", args)
        self.assertEqual(args[-1], "--skip-crds")

    def test_never_upgrade_values_or_ownership(self):
        args = job.argv(_spec())
        for forbidden in ("upgrade", "--install", "--values", "-f", "--set", "--take-ownership"):
            self.assertNotIn(forbidden, args)

    def test_hostile_values_stay_single_arguments(self):
        user = 'x"; rm -rf / $(id) `id`'
        args = job.argv(_spec(installed_by=user))
        self.assertEqual(args[-1], f"installed-by={user}")
        self.assertEqual(len(args), len(job.argv(_spec())))

    def test_timeouts_from_env(self):
        with patch.dict(os.environ, {job.HELM_TIMEOUT_ENV: "20", job.TOTAL_TIMEOUT_ENV: "30"}):
            args = job.argv(_spec())
        self.assertEqual(args[4], "30")
        self.assertEqual(args[args.index("--timeout") + 1], "20s")

    def test_invalid_env_falls_back(self):
        with patch.dict(os.environ, {job.HELM_TIMEOUT_ENV: "abc", job.TOTAL_TIMEOUT_ENV: "-5"}):
            args = job.argv(_spec())
        self.assertEqual(args[4], "660")
        self.assertEqual(args[args.index("--timeout") + 1], "600s")


class TestBuild(unittest.TestCase):
    def setUp(self):
        patcher = patch.dict(os.environ, {}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_job_identity_and_annotations(self):
        body = job.build(_spec(), IMAGE)
        meta = body["metadata"]
        self.assertEqual((body["apiVersion"], body["kind"]), ("batch/v1", "Job"))
        self.assertEqual((meta["name"], meta["namespace"]), ("marketplace-install-phoenix", "team-a"))
        self.assertEqual(meta["labels"], {"ark.mckinsey.com/marketplace-install": "phoenix"})
        self.assertEqual(body["spec"]["template"]["metadata"]["labels"], meta["labels"])
        self.assertEqual(
            meta["annotations"],
            {
                "ark.mckinsey.com/marketplace-install-source": "official",
                "ark.mckinsey.com/marketplace-install-item": "phoenix",
                "ark.mckinsey.com/marketplace-install-digest": DIGEST,
                "ark.mckinsey.com/marketplace-install-chart-version": "0.1.12",
                "ark.mckinsey.com/marketplace-install-installed-by": "alice@example.com",
            },
        )
        self.assertNotIn("ark.mckinsey.com/marketplace-install-installed-by", job.build(_spec(installed_by=None), IMAGE)["metadata"]["annotations"])

    def test_job_spec(self):
        spec = job.build(_spec(), IMAGE)["spec"]
        self.assertEqual(spec["backoffLimit"], 0)
        self.assertEqual(spec["activeDeadlineSeconds"], 900)
        self.assertEqual(
            spec["podFailurePolicy"],
            {"rules": [{"action": "FailJob", "onExitCodes": {"containerName": "helm", "operator": "In", "values": [124]}}]},
        )
        self.assertNotIn("ttlSecondsAfterFinished", spec)
        with patch.dict(os.environ, {job.JOB_DEADLINE_ENV: "60"}):
            self.assertEqual(job.build(_spec(), IMAGE)["spec"]["activeDeadlineSeconds"], 60)

    def test_pod_runs_as_the_installer_with_a_restricted_context(self):
        template = job.build(_spec(), IMAGE)["spec"]["template"]
        pod = template["spec"]
        self.assertEqual(template["metadata"]["annotations"], {"sidecar.istio.io/inject": "false", "linkerd.io/inject": "disabled"})
        self.assertEqual(pod["serviceAccountName"], "ark-marketplace-installer")
        self.assertEqual(pod["restartPolicy"], "Never")
        self.assertNotIn("automountServiceAccountToken", pod)
        self.assertEqual(pod["securityContext"], {"runAsNonRoot": True, "runAsUser": 1001, "seccompProfile": {"type": "RuntimeDefault"}})
        self.assertNotIn("imagePullSecrets", pod)
        container = pod["containers"][0]
        self.assertEqual((container["name"], container["image"]), ("helm", IMAGE))
        self.assertEqual(container["command"], job.argv(_spec()))
        self.assertNotIn("args", container)
        self.assertEqual(
            container["securityContext"],
            {"allowPrivilegeEscalation": False, "capabilities": {"drop": ["ALL"]}, "readOnlyRootFilesystem": True, "runAsNonRoot": True},
        )
        self.assertEqual(container["resources"], {"requests": {"cpu": "50m", "memory": "64Mi"}, "limits": {"cpu": "500m", "memory": "256Mi"}})
        self.assertEqual(container["volumeMounts"], [{"name": "work", "mountPath": "/work"}])
        self.assertEqual(pod["volumes"], [{"name": "work", "emptyDir": {}}])
        env = {e["name"]: e["value"] for e in container["env"]}
        self.assertEqual(
            env,
            {
                "HOME": "/work",
                "TMPDIR": "/work",
                "HELM_CACHE_HOME": "/work/helm/cache",
                "HELM_CONFIG_HOME": "/work/helm/config",
                "HELM_DATA_HOME": "/work/helm/data",
            },
        )

    def test_pull_secrets_from_env(self):
        with patch.dict(os.environ, {job.IMAGE_PULL_SECRETS_ENV: " regcred , other ,"}):
            pod = job.build(_spec(), IMAGE)["spec"]["template"]["spec"]
        self.assertEqual(pod["imagePullSecrets"], [{"name": "regcred"}, {"name": "other"}])

    def test_long_release_names_fit(self):
        body = job.build(_spec(release="a" * 53), IMAGE)
        self.assertLessEqual(len(body["metadata"]["name"]), 63)
        self.assertEqual(body["metadata"]["labels"]["ark.mckinsey.com/marketplace-install"], "a" * 53)

    def test_image_from_env(self):
        self.assertIsNone(job.image())
        with patch.dict(os.environ, {job.IMAGE_ENV: f"  {IMAGE} "}):
            self.assertEqual(job.image(), IMAGE)


if __name__ == "__main__":
    unittest.main()
