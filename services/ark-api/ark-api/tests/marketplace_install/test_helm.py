import asyncio
import json
import os
import sys
import tempfile
import textwrap
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from src.ark_api.marketplace_install import helm

CHART_REF = "oci://registry.example.com:5000/charts/fixture-ok"
DIGEST = "sha256:" + "a" * 64


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


class FakeHelmTestCase(unittest.TestCase):
    def setUp(self):
        self.scratch = Path(tempfile.mkdtemp(prefix="fake-helm-"))
        self.record = self.scratch / "record.jsonl"
        self.workdir = self.scratch / "unset"
        semaphore = patch.object(helm, "_SEMAPHORE", asyncio.Semaphore(helm.MAX_CONCURRENT_RUNS))
        semaphore.start()
        self.addCleanup(semaphore.stop)

    def fake_helm(self, body: str) -> None:
        script = self.scratch / "helm"
        prelude = textwrap.dedent(
            f"""\
            import json, os, sys, time
            RECORD = {str(self.record)!r}
            with open(RECORD, "a") as f:
                f.write(json.dumps({{"argv": sys.argv[1:], "env": dict(os.environ), "cwd": os.getcwd(), "pid": os.getpid()}}) + "\\n")
            """
        )
        script.write_text(f"#!{sys.executable}\n{prelude}{textwrap.dedent(body)}")
        script.chmod(0o755)
        binary = patch.object(helm, "HELM_BINARY", str(script))
        binary.start()
        self.addCleanup(binary.stop)

    def calls(self) -> list[dict]:
        if not self.record.exists():
            return []
        return [json.loads(line) for line in self.record.read_text().splitlines()]

    def run_in_workspace(self, operation):
        async def _go():
            async with helm.workspace() as workdir:
                self.workdir = workdir
                return await operation(workdir)

        return asyncio.run(_go())

    def pull(self, chart_ref=CHART_REF, plain_http=False):
        return self.run_in_workspace(lambda workdir: helm.pull(chart_ref, plain_http, workdir))

    def template(self):
        return self.run_in_workspace(lambda workdir: helm.template(workdir / "chart.tgz", "demo", "team-a", workdir))


PULL_OK = """\
dest = sys.argv[sys.argv.index("--destination") + 1]
open(os.path.join(dest, "fixture-ok-0.1.0.tgz"), "wb").write(b"chart")
sys.stderr.write("Pulled: registry.example.com:5000/charts/fixture-ok:0.1.0\\nDigest: DIGEST\\n")
""".replace("DIGEST", DIGEST)


class TestPull(FakeHelmTestCase):
    def test_pull_reports_digest_version_and_archive(self):
        self.fake_helm(PULL_OK)
        pulled = self.pull()
        self.assertEqual(pulled.digest, DIGEST)
        self.assertEqual(pulled.version, "0.1.0")
        self.assertEqual(pulled.path.name, "fixture-ok-0.1.0.tgz")
        [call] = self.calls()
        self.assertEqual(call["argv"], ["pull", CHART_REF, "--destination", str(self.workdir / "chart")])

    def test_plain_http_only_when_asked(self):
        self.fake_helm(PULL_OK)
        self.pull(plain_http=True)
        self.assertEqual(self.calls()[0]["argv"][-1], "--plain-http")

    def test_runs_with_a_private_environment(self):
        self.fake_helm(PULL_OK)
        leaked = {
            "KUBECONFIG": "/root/.kube/config",
            "HELM_REGISTRY_CONFIG": "/root/registry.json",
            "HELM_CACHE_HOME": "/home/ark/.cache/helm",
            "KUBERNETES_SERVICE_HOST": "10.0.0.1",
            "ARK_API_SECRET": "do-not-pass",
        }
        with patch.dict(os.environ, leaked):
            self.pull()
        [call] = self.calls()
        env, home = call["env"], str(self.workdir / "home")
        self.assertEqual(call["cwd"], os.path.realpath(self.workdir))
        self.assertEqual(env["KUBECONFIG"], os.devnull)
        self.assertNotIn("ARK_API_SECRET", env)
        self.assertNotIn("KUBERNETES_SERVICE_HOST", env)
        for name in ("HELM_CACHE_HOME", "HELM_CONFIG_HOME", "HELM_DATA_HOME", "HELM_REGISTRY_CONFIG", "HELM_REPOSITORY_CONFIG", "HELM_REPOSITORY_CACHE", "HOME"):
            with self.subTest(name=name):
                self.assertTrue(env[name].startswith(home), env[name])

    def test_workspace_is_removed(self):
        self.fake_helm(PULL_OK)
        self.pull()
        self.assertFalse(self.workdir.exists())

    def test_workspace_is_removed_on_error(self):
        self.fake_helm("sys.exit(1)")
        with self.assertRaises(helm.HelmError):
            self.pull()
        self.assertFalse(self.workdir.exists())

    def test_failure_names_the_registry_and_cleans_stderr(self):
        self.fake_helm('sys.stderr.write("\\x1b[31mError: 401 unauthorized\\x07\\n"); sys.exit(1)')
        with self.assertRaises(helm.HelmError) as raised:
            self.pull()
        self.assertEqual(raised.exception.code, helm.CHART_UNAVAILABLE)
        self.assertEqual(
            raised.exception.message, "Could not pull the chart from registry.example.com:5000: Error: 401 unauthorized"
        )

    def test_message_keeps_only_the_helm_error_line(self):
        self.fake_helm(
            'sys.stderr.write("dial tcp: lookup ghcr.io on 10.96.0.10:53: no such host\\n'
            'Error: failed to do request\\n"); sys.exit(1)'
        )
        with self.assertRaises(helm.HelmError) as raised:
            self.pull()
        self.assertEqual(
            raised.exception.message, "Could not pull the chart from registry.example.com:5000: Error: failed to do request"
        )

    def test_long_stderr_is_cut_in_the_message(self):
        self.fake_helm('sys.stderr.write("x" * 200000); sys.exit(1)')
        with self.assertRaises(helm.HelmError) as raised:
            self.pull()
        self.assertLessEqual(len(raised.exception.message), helm.MAX_MESSAGE_CHARS + 100)

    def test_missing_digest(self):
        self.fake_helm(PULL_OK.replace("Digest:", "Checksum:"))
        with self.assertRaises(helm.HelmError) as raised:
            self.pull()
        self.assertEqual(raised.exception.code, helm.CHART_UNAVAILABLE)

    def test_malformed_digest(self):
        self.fake_helm(PULL_OK.replace(DIGEST, "sha256:xyz"))
        with self.assertRaises(helm.HelmError):
            self.pull()

    def test_missing_archive(self):
        self.fake_helm(PULL_OK.replace('open(os.path.join(dest, "fixture-ok-0.1.0.tgz"), "wb").write(b"chart")', "pass"))
        with self.assertRaises(helm.HelmError):
            self.pull()

    def test_archive_too_large(self):
        self.fake_helm(PULL_OK)
        with patch.object(helm, "MAX_CHART_BYTES", 2):
            with self.assertRaises(helm.HelmError) as raised:
                self.pull()
        self.assertIn("larger than", raised.exception.message)

    def test_missing_binary(self):
        with patch.object(helm, "HELM_BINARY", str(self.scratch / "missing")):
            with self.assertRaises(FileNotFoundError):
                self.pull()


MANIFEST = """\
---
# Source: demo/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: demo
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo
  annotations:
    helm.sh/hook: pre-install
---
"""


class TestTemplate(FakeHelmTestCase):
    def test_renders_with_hooks_and_crds(self):
        self.fake_helm(f"sys.stdout.write({MANIFEST!r})")
        objects = self.template()
        self.assertEqual([o["kind"] for o in objects], ["ConfigMap", "Deployment"])
        [call] = self.calls()
        self.assertEqual(
            call["argv"],
            ["template", "demo", str(self.workdir / "chart.tgz"), "--namespace", "team-a", "--include-crds"],
        )

    def test_render_failure(self):
        self.fake_helm('sys.stderr.write("Error: template: demo/templates/x.yaml:3: nil pointer\\n"); sys.exit(1)')
        with self.assertRaises(helm.HelmError) as raised:
            self.template()
        self.assertEqual(raised.exception.code, helm.RENDER_FAILED)
        self.assertIn("nil pointer", raised.exception.message)

    def test_invalid_yaml(self):
        self.fake_helm('sys.stdout.write("kind: [unclosed\\n")')
        with self.assertRaises(helm.HelmError) as raised:
            self.template()
        self.assertEqual(raised.exception.code, helm.RENDER_FAILED)

    def test_yaml_aliases_are_rejected(self):
        bomb = "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: x}\ndata:\n  a: &a [1, 1, 1]\n  b: [*a, *a, *a]\n"
        self.fake_helm(f"sys.stdout.write({bomb!r})")
        with self.assertRaises(helm.HelmError) as raised:
            self.template()
        self.assertIn("aliases", raised.exception.message)

    def test_python_tags_are_not_constructed(self):
        self.fake_helm('sys.stdout.write("apiVersion: v1\\nkind: !!python/object/apply:os.system [\\"true\\"]\\n")')
        with self.assertRaises(helm.HelmError):
            self.template()

    def test_documents_that_are_not_objects(self):
        for document in ("- a\n- b\n", "just a string\n", "kind: ConfigMap\n", "apiVersion: v1\nkind: 3\n"):
            with self.subTest(document=document):
                self.record.unlink(missing_ok=True)
                self.fake_helm(f"sys.stdout.write({document!r})")
                with self.assertRaises(helm.HelmError):
                    self.template()

    def test_too_many_objects(self):
        self.fake_helm(f"sys.stdout.write({MANIFEST!r})")
        with patch.object(helm, "MAX_OBJECTS", 1):
            with self.assertRaises(helm.HelmError) as raised:
                self.template()
        self.assertIn("more than 1 objects", raised.exception.message)

    def test_document_count_is_checked_before_parsing(self):
        self.fake_helm('sys.stdout.write("---\\napiVersion: v1\\nkind: ConfigMap\\n" * 5)')
        with patch.object(helm, "MAX_OBJECTS", 2), patch.object(helm.yaml, "load_all", side_effect=AssertionError("parsed")):
            with self.assertRaises(helm.HelmError) as raised:
                self.template()
        self.assertIn("more than 2 objects", raised.exception.message)

    def test_deep_nesting_is_a_render_failure(self):
        self.fake_helm('sys.stdout.write("apiVersion: v1\\nkind: ConfigMap\\ndata: " + "[" * 5000 + "]" * 5000 + "\\n")')
        with self.assertRaises(helm.HelmError) as raised:
            self.template()
        self.assertEqual(raised.exception.message, "The rendered chart is nested too deeply")

    def test_parsing_does_not_block_the_event_loop(self):
        self.fake_helm(f"sys.stdout.write({MANIFEST!r})")
        parsing = threading.Event()
        parse_window = []
        ticks = []

        def slow_parse(manifest):
            parse_window.append(time.monotonic())
            parsing.set()
            time.sleep(0.5)
            parse_window.append(time.monotonic())
            return []

        async def ticker():
            while not parsing.is_set():
                await asyncio.sleep(0.01)
            for _ in range(5):
                ticks.append(time.monotonic())
                await asyncio.sleep(0.02)

        async def _go():
            async with helm.workspace() as workdir:
                await asyncio.gather(helm.template(workdir / "c", "demo", "team-a", workdir), ticker())

        with patch.object(helm, "_parse", slow_parse):
            asyncio.run(_go())
        start, end = parse_window
        self.assertEqual(len(ticks), 5)
        self.assertTrue(all(start <= tick < end for tick in ticks))

    def test_output_over_the_cap_kills_helm(self):
        self.fake_helm('sys.stdout.write("x" * 4096); sys.stdout.flush(); time.sleep(60)')
        started = time.monotonic()
        with patch.object(helm, "MAX_OUTPUT_BYTES", 1024):
            with self.assertRaises(helm.HelmError) as raised:
                self.template()
        self.assertLess(time.monotonic() - started, 10)
        self.assertEqual(raised.exception.code, helm.RENDER_FAILED)
        self.assertFalse(_alive(self.calls()[0]["pid"]))

    def test_large_stderr_does_not_fail_a_render(self):
        self.fake_helm(f'sys.stderr.write("w" * 500000); sys.stdout.write({MANIFEST!r})')
        self.assertEqual(len(self.template()), 2)


class TestLimits(FakeHelmTestCase):
    def test_timeout_kills_helm(self):
        self.fake_helm("time.sleep(60)")

        async def _go():
            async with helm.workspace() as workdir:
                self.workdir = workdir
                run = asyncio.ensure_future(helm.template(workdir / "c", "demo", "team-a", workdir))
                deadline = time.monotonic() + 30
                while not self.calls() and time.monotonic() < deadline:
                    await asyncio.sleep(0.05)
                await asyncio.wait_for(run, timeout=0.5)

        with self.assertRaises(asyncio.TimeoutError):
            asyncio.run(_go())
        self.assertFalse(_alive(self.calls()[0]["pid"]))
        self.assertFalse(self.workdir.exists())

    def test_at_most_two_runs_at_a_time(self):
        running = self.scratch / "running"
        running.mkdir()
        self.fake_helm(
            f"""\
            marker = os.path.join({str(running)!r}, str(os.getpid()))
            open(marker, "w").close()
            with open({str(self.scratch / "seen")!r}, "a") as f:
                f.write(str(len(os.listdir({str(running)!r}))) + "\\n")
            time.sleep(0.5)
            os.remove(marker)
            sys.stdout.write({MANIFEST!r})
            """
        )

        async def _go():
            async with helm.workspace() as workdir:
                return await asyncio.gather(
                    *(helm.template(workdir / "c", "demo", "team-a", workdir) for _ in range(3))
                )

        results = asyncio.run(_go())
        self.assertEqual(len(results), 3)
        seen = [int(n) for n in (self.scratch / "seen").read_text().split()]
        self.assertEqual(len(seen), 3)
        self.assertLessEqual(max(seen), 2)


if __name__ == "__main__":
    unittest.main()
