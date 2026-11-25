import dataclasses
import os
import unittest
from unittest.mock import patch

from src.ark_api.marketplace_install import preview_cache
from src.ark_api.marketplace_install.checks import ObjectRef

DIGEST = "sha256:" + "a" * 64
OBJECTS = (ObjectRef("v1", "ConfigMap", "demo", "configmaps", True),)


def _entry(digest=DIGEST, created_at=100.0, blocked=False):
    return preview_cache.PreviewEntry(
        release="demo",
        chart_ref="oci://registry.example.com/charts/demo",
        chart_version="0.1.0",
        digest=digest,
        blocked=blocked,
        objects=OBJECTS,
        created_at=created_at,
    )


class TestPreviewCache(unittest.TestCase):
    def setUp(self):
        preview_cache.clear()
        self.addCleanup(preview_cache.clear)
        env = patch.dict(os.environ, {}, clear=False)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop(preview_cache.CACHE_SECONDS_ENV, None)
        os.environ.pop(preview_cache.CACHE_MAX_ENTRIES_ENV, None)
        self.clock = 100.0
        clock = patch.object(preview_cache, "now", lambda: self.clock)
        clock.start()
        self.addCleanup(clock.stop)

    def test_round_trip(self):
        preview_cache.put("team-a", "official", "demo", _entry())
        self.assertEqual(preview_cache.get("team-a", "official", "demo", DIGEST), _entry())

    def test_key_includes_every_part(self):
        preview_cache.put("team-a", "official", "demo", _entry())
        for key in (("team-b", "official", "demo", DIGEST), ("team-a", "other", "demo", DIGEST),
                    ("team-a", "official", "other", DIGEST), ("team-a", "official", "demo", "sha256:" + "b" * 64)):
            with self.subTest(key=key):
                self.assertIsNone(preview_cache.get(*key))

    def test_entries_expire_after_ten_minutes_by_default(self):
        preview_cache.put("team-a", "official", "demo", _entry())
        self.clock = 700.0
        self.assertIsNotNone(preview_cache.get("team-a", "official", "demo", DIGEST))
        self.clock = 700.1
        self.assertIsNone(preview_cache.get("team-a", "official", "demo", DIGEST))
        self.clock = 100.0
        self.assertIsNone(preview_cache.get("team-a", "official", "demo", DIGEST))

    def test_ttl_from_env(self):
        os.environ[preview_cache.CACHE_SECONDS_ENV] = "5"
        preview_cache.put("team-a", "official", "demo", _entry())
        self.clock = 106.0
        self.assertIsNone(preview_cache.get("team-a", "official", "demo", DIGEST))

    def test_invalid_env_falls_back_to_defaults(self):
        for value in ("", "abc", "0", "-3"):
            with self.subTest(value=value):
                os.environ[preview_cache.CACHE_SECONDS_ENV] = value
                os.environ[preview_cache.CACHE_MAX_ENTRIES_ENV] = value
                self.assertEqual(preview_cache.ttl_seconds(), 600)
                self.assertEqual(preview_cache.max_entries(), 256)

    def test_oldest_entry_goes_first(self):
        os.environ[preview_cache.CACHE_MAX_ENTRIES_ENV] = "2"
        for item in ("a", "b", "c"):
            preview_cache.put("team-a", "official", item, _entry())
        self.assertIsNone(preview_cache.get("team-a", "official", "a", DIGEST))
        self.assertIsNotNone(preview_cache.get("team-a", "official", "b", DIGEST))
        self.assertIsNotNone(preview_cache.get("team-a", "official", "c", DIGEST))

    def test_a_new_preview_replaces_the_old_one(self):
        preview_cache.put("team-a", "official", "demo", _entry())
        preview_cache.put("team-a", "official", "demo", _entry(blocked=True, created_at=200.0))
        self.assertTrue(preview_cache.get("team-a", "official", "demo", DIGEST).blocked)

    def test_entries_hold_identities_not_manifests(self):
        self.assertEqual(
            {f.name for f in dataclasses.fields(preview_cache.PreviewEntry)},
            {"release", "chart_ref", "chart_version", "digest", "blocked", "objects", "created_at"},
        )
        self.assertEqual({f.name for f in dataclasses.fields(ObjectRef)}, {"api_version", "kind", "name", "plural", "namespaced"})


if __name__ == "__main__":
    unittest.main()
