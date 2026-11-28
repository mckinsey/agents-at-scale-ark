import asyncio
import os
import shutil
import subprocess
import unittest
from pathlib import Path

from src.ark_api.marketplace_install import helm

PINNED_VERSION = "v3.22."
FIXTURE = Path(__file__).resolve().parents[5] / "tests" / "marketplace-install" / "fixture" / "mkt-fixture"
REGISTRY = os.environ.get("MARKETPLACE_INSTALL_TEST_REGISTRY", "")
NAMESPACE = "team-a"


def _helm_version() -> str:
    binary = shutil.which(helm.HELM_BINARY)
    if binary is None:
        return ""
    result = subprocess.run([binary, "version", "--short"], capture_output=True, text=True, timeout=30)
    return result.stdout.strip() if result.returncode == 0 else ""


HELM_VERSION = _helm_version()


@unittest.skipUnless(HELM_VERSION.startswith(PINNED_VERSION), f"needs helm {PINNED_VERSION}x, found {HELM_VERSION or 'none'}")
class TestHelmIntegration(unittest.TestCase):
    def setUp(self):
        self.assertTrue(FIXTURE.is_dir(), FIXTURE)

    def render(self, variant: str) -> list[dict]:
        async def _go():
            async with helm.workspace() as workdir:
                chart = workdir / "mkt-fixture"
                shutil.copytree(FIXTURE, chart)
                values = chart / "values.yaml"
                values.write_text(values.read_text().replace("variant: ok\n", f"variant: {variant}\n"))
                return await helm.template(chart, "demo", NAMESPACE, workdir)

        return asyncio.run(_go())

    def names(self, objects: list[dict]) -> set[tuple[str, str]]:
        return {(o["kind"], o["metadata"]["name"]) for o in objects}

    def test_base_objects_have_no_namespace(self):
        objects = self.render("ok")
        self.assertEqual(
            self.names(objects), {("Deployment", "demo"), ("Service", "demo"), ("ConfigMap", "demo-config")}
        )
        for obj in objects:
            self.assertNotIn("namespace", obj["metadata"])

    def test_hooks_are_rendered_with_their_annotations(self):
        objects = self.render("fail")
        [hook] = [o for o in objects if o["kind"] == "Job"]
        self.assertEqual(hook["metadata"]["annotations"]["helm.sh/hook"], "pre-install")

    def test_crds_and_cluster_objects_are_rendered(self):
        self.assertIn(("CustomResourceDefinition", "widgets.fixture.example.com"), self.names(self.render("crd")))
        objects = self.render("cluster")
        self.assertIn(("ClusterRole", "demo-cluster"), self.names(objects))
        [elsewhere] = [o for o in objects if o["metadata"]["name"] == "demo-elsewhere"]
        self.assertEqual(elsewhere["metadata"]["namespace"], "default")

    def test_every_variant_renders(self):
        variants = [
            "ok", "slow", "fail", "hook", "conflict", "cluster", "crd", "skiplabel", "rbac",
            "rbac-installer-sa", "nosc", "reserved-secret", "personal-ref", "ark",
        ]
        for variant in variants:
            with self.subTest(variant=variant):
                self.assertGreaterEqual(len(self.render(variant)), 3)

    @unittest.skipUnless(REGISTRY, "set MARKETPLACE_INSTALL_TEST_REGISTRY to a registry holding the fixture")
    def test_pull_pins_a_digest_and_renders_the_archive(self):
        chart_ref = f"oci://{REGISTRY}/charts/fixture-ok"

        async def _go():
            async with helm.workspace() as workdir:
                pulled = await helm.pull(chart_ref, True, workdir)
                objects = await helm.template(pulled.path, "demo", NAMESPACE, workdir)
                return pulled, objects

        pulled, objects = asyncio.run(_go())
        self.assertRegex(pulled.digest, r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(pulled.version, "0.1.0")
        self.assertEqual(len(objects), 3)

        async def _by_digest():
            async with helm.workspace() as workdir:
                return await helm.pull(f"{chart_ref}@{pulled.digest}", True, workdir)

        self.assertEqual(asyncio.run(_by_digest()).digest, pulled.digest)

    @unittest.skipUnless(REGISTRY, "set MARKETPLACE_INSTALL_TEST_REGISTRY to a registry holding the fixture")
    def test_missing_chart_names_the_registry(self):
        async def _go():
            async with helm.workspace() as workdir:
                await helm.pull(f"oci://{REGISTRY}/charts/does-not-exist", True, workdir)

        with self.assertRaises(helm.HelmError) as raised:
            asyncio.run(_go())
        self.assertIn(REGISTRY, raised.exception.message)


if __name__ == "__main__":
    unittest.main()
