"""Tests for ark_api.services.pkce."""
from __future__ import annotations

import base64
import hashlib
import string
import unittest

from ark_api.services.pkce import (
    DEFAULT_VERIFIER_LENGTH,
    MAX_VERIFIER_LENGTH,
    MIN_VERIFIER_LENGTH,
    derive_challenge,
    generate_auth_id,
    generate_state,
    generate_verifier,
)


class TestPkce(unittest.TestCase):
    def test_default_verifier_length(self):
        verifier = generate_verifier()
        self.assertEqual(len(verifier), DEFAULT_VERIFIER_LENGTH)

    def test_verifier_alphabet(self):
        allowed = set(string.ascii_letters + string.digits + "-._~")
        for _ in range(64):
            verifier = generate_verifier()
            self.assertTrue(set(verifier).issubset(allowed))

    def test_verifier_length_bounds(self):
        with self.assertRaises(ValueError):
            generate_verifier(MIN_VERIFIER_LENGTH - 1)
        with self.assertRaises(ValueError):
            generate_verifier(MAX_VERIFIER_LENGTH + 1)
        self.assertEqual(len(generate_verifier(MIN_VERIFIER_LENGTH)), MIN_VERIFIER_LENGTH)
        self.assertEqual(len(generate_verifier(MAX_VERIFIER_LENGTH)), MAX_VERIFIER_LENGTH)

    def test_challenge_matches_s256(self):
        verifier = generate_verifier()
        expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
        self.assertEqual(derive_challenge(verifier), expected)

    def test_state_has_minimum_entropy(self):
        state = generate_state()
        decoded = base64.urlsafe_b64decode(state + "=" * (-len(state) % 4))
        self.assertGreaterEqual(len(decoded), 16)

    def test_state_values_differ(self):
        self.assertNotEqual(generate_state(), generate_state())

    def test_auth_id_has_minimum_entropy(self):
        auth_id = generate_auth_id()
        decoded = base64.urlsafe_b64decode(auth_id + "=" * (-len(auth_id) % 4))
        self.assertGreaterEqual(len(decoded), 16)

    def test_auth_id_values_differ(self):
        self.assertNotEqual(generate_auth_id(), generate_auth_id())


if __name__ == "__main__":
    unittest.main()
