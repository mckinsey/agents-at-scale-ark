import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULES = [
    "src.ark_api.marketplace_install.catalog",
    "src.ark_api.marketplace_install.checks",
    "src.ark_api.marketplace_install.helm",
    "src.ark_api.marketplace_install.preview",
    "src.ark_api.marketplace_install.preview_cache",
    "src.ark_api.api.v1.marketplace_installs",
]


class TestImports(unittest.TestCase):
    def test_each_module_imports_on_its_own(self):
        for module in MODULES:
            with self.subTest(module=module):
                result = subprocess.run(
                    [sys.executable, "-c", f"import {module}"], cwd=ROOT, capture_output=True, text=True, timeout=60
                )
                self.assertEqual(result.returncode, 0, result.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
