import unittest

from ark_api.utils.output_schema import (
    EMPTY_MESSAGE,
    INVALID_JSON_MESSAGE,
    NOT_OBJECT_MESSAGE,
    ROOT_TYPE_MESSAGE,
    validate_output_schema,
)


class TestValidateOutputSchema(unittest.TestCase):
    def test_accepts_object_schema(self):
        schema = """{
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "tags": {"type": "array", "items": {"type": ["string", "null"]}},
                "meta": {"anyOf": [{"type": "integer"}, true]}
            },
            "additionalProperties": false,
            "$defs": {"id": {"type": "number"}}
        }"""
        self.assertIsNone(validate_output_schema(schema))

    def test_rejects_empty(self):
        for value in ("", "   "):
            with self.subTest(value=value):
                self.assertEqual(validate_output_schema(value), EMPTY_MESSAGE)

    def test_rejects_invalid_json(self):
        self.assertEqual(validate_output_schema("{not json"), INVALID_JSON_MESSAGE)

    def test_rejects_non_object(self):
        for value in ("[]", '"text"', "1", "null"):
            with self.subTest(value=value):
                self.assertEqual(validate_output_schema(value), NOT_OBJECT_MESSAGE)

    def test_rejects_root_without_object_type(self):
        for value in ("{}", '{"type": "string"}', '{"type": "strng"}'):
            with self.subTest(value=value):
                self.assertEqual(validate_output_schema(value), ROOT_TYPE_MESSAGE)

    def test_rejects_unknown_nested_type(self):
        error = validate_output_schema(
            '{"type": "object", "properties": {"a": {"type": "strng"}}}'
        )
        self.assertEqual(error, 'Unknown type "strng" at root.properties.a.')

    def test_rejects_unknown_type_in_list(self):
        error = validate_output_schema(
            '{"type": "object", "properties": {"a": {"oneOf": [{"type": 1}]}}}'
        )
        self.assertEqual(error, "Unknown type 1 at root.properties.a.oneOf[0].")

    def test_rejects_non_object_subschema(self):
        error = validate_output_schema('{"type": "object", "items": "string"}')
        self.assertEqual(error, "The schema at root.items must be a JSON object.")

    def test_rejects_malformed_keyword_containers(self):
        cases = {
            '{"type": "object", "anyOf": {}}': '"anyOf" at root must be an array.',
            '{"type": "object", "properties": []}': '"properties" at root must be an object.',
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(validate_output_schema(value), expected)


if __name__ == "__main__":
    unittest.main()
