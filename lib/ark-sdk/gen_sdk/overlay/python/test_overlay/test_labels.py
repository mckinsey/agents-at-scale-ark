import unittest

from ark_sdk.labels import NAME_LABEL, with_name_label


class TestWithNameLabel(unittest.TestCase):
    def test_label_key(self):
        self.assertEqual(NAME_LABEL, "ark.mckinsey.com/name")

    def test_adds_the_label_when_there_are_none(self):
        self.assertEqual(with_name_label(None, "github"), {NAME_LABEL: "github"})
        self.assertEqual(with_name_label({}, "github"), {NAME_LABEL: "github"})

    def test_keeps_other_labels(self):
        labels = {"team": "a", "ark.mckinsey.com/label.prod": "true"}

        result = with_name_label(labels, "github")

        self.assertEqual(result, {**labels, NAME_LABEL: "github"})
        self.assertNotIn(NAME_LABEL, labels)

    def test_replaces_a_different_value(self):
        self.assertEqual(
            with_name_label({NAME_LABEL: "other", "team": "a"}, "github"),
            {NAME_LABEL: "github", "team": "a"},
        )

    def test_name_of_63_characters_is_labelled(self):
        name = "a" * 63

        self.assertEqual(with_name_label(None, name), {NAME_LABEL: name})

    def test_name_longer_than_63_characters_is_not_labelled(self):
        self.assertEqual(with_name_label({"team": "a"}, "a" * 64), {"team": "a"})

    def test_unlabellable_name_drops_an_existing_label(self):
        self.assertEqual(
            with_name_label({NAME_LABEL: "github", "team": "a"}, "a" * 64),
            {"team": "a"},
        )

    def test_names_that_are_not_label_values_are_not_labelled(self):
        for name in ("", "-github", "github.", "git/hub", "git/hub.v2", "a b", "a_b/", "github\n"):
            with self.subTest(name=name):
                self.assertEqual(with_name_label(None, name), {})

    def test_dotted_name_is_labelled(self):
        self.assertEqual(with_name_label(None, "github.v2"), {NAME_LABEL: "github.v2"})


if __name__ == "__main__":
    unittest.main()
