"""
Tests for EvaluationPromptBuilder

Following TDD principles to ensure no regressions when refactoring prompt building.
"""

import unittest
from unittest.mock import Mock

from src.evaluator.prompt_builder import (
    EvaluationPromptBuilder,
    build_evaluation_prompt,
    PromptSection
)
from src.evaluator.types import EvaluationRequest, EvaluationParameters
from src.evaluator.agent_resolver import AgentInstructions


class TestPromptSection(unittest.TestCase):
    """Test PromptSection dataclass"""

    def test_render_with_title(self):
        section = PromptSection(title="TEST:", content="test content", order=1)
        result = section.render()
        self.assertIn("TEST:", result)
        self.assertIn("test content", result)

    def test_render_without_title(self):
        section = PromptSection(title="", content="test content", order=1)
        result = section.render()
        self.assertEqual("test content", result)

    def test_render_empty_content(self):
        section = PromptSection(title="TEST:", content="", order=1)
        result = section.render()
        self.assertEqual("", result)


class TestEvaluationPromptBuilder(unittest.TestCase):
    """Test EvaluationPromptBuilder class"""

    def setUp(self):
        self.builder = EvaluationPromptBuilder()
        self.mock_request = Mock(spec=EvaluationRequest)
        self.mock_request.input = "Test query"
        self.mock_request.responses = [
            Mock(target=Mock(type="agent", name="test-agent"), content="Test response")
        ]
        self.mock_params = Mock(spec=EvaluationParameters)
        self.mock_params.evaluator_role = "Test evaluator"
        self.mock_params.min_score = 0.7
        self.mock_params.context = None
        self.mock_params.get_scope_list = Mock(return_value=["accuracy", "relevance"])

    def test_builder_fluent_interface(self):
        """Test that builder methods return self for chaining"""
        result = self.builder.set_evaluator_role("test")
        self.assertIs(result, self.builder)

        result = self.builder.add_user_query("query")
        self.assertIs(result, self.builder)

    def test_set_evaluator_role_custom(self):
        """Test setting custom evaluator role"""
        self.builder.set_evaluator_role("Custom role")
        self.assertEqual(self.builder._evaluator_role, "Custom role")

    def test_set_evaluator_role_default(self):
        """Test default evaluator role when None provided"""
        self.builder.set_evaluator_role(None)
        self.assertIn("AI evaluator", self.builder._evaluator_role)

    def test_add_user_query(self):
        """Test adding user query section"""
        self.builder.add_user_query("Test query")
        self.assertEqual(len(self.builder._sections), 1)
        self.assertEqual(self.builder._sections[0].title, "USER QUERY:")
        self.assertEqual(self.builder._sections[0].content, "Test query")

    def test_add_response(self):
        """Test adding response section"""
        self.builder.add_response(self.mock_request)
        self.assertEqual(len(self.builder._sections), 1)
        self.assertEqual(self.builder._sections[0].title, "RESPONSE TO EVALUATE:")
        self.assertIn("test-agent", self.builder._sections[0].content)
        self.assertIn("Test response", self.builder._sections[0].content)

    def test_add_agent_instructions(self):
        """Test adding agent instructions"""
        agent_instructions = Mock(spec=AgentInstructions)
        agent_instructions.name = "test-agent"
        agent_instructions.description = "Test description"

        self.builder.add_agent_instructions(agent_instructions)
        self.assertEqual(len(self.builder._sections), 1)
        self.assertEqual(self.builder._sections[0].title, "AGENT INSTRUCTIONS:")
        self.assertIn("test-agent", self.builder._sections[0].content)
        self.assertIn("Test description", self.builder._sections[0].content)
        self.assertIn("SCORING GUIDELINES", self.builder._sections[0].content)

    def test_add_agent_instructions_none(self):
        """Test that None agent instructions are skipped"""
        self.builder.add_agent_instructions(None)
        self.assertEqual(len(self.builder._sections), 0)

    def test_add_context(self):
        """Test adding additional context"""
        self.builder.add_context("Additional context here")
        self.assertEqual(len(self.builder._sections), 1)
        self.assertEqual(self.builder._sections[0].title, "ADDITIONAL CONTEXT:")
        self.assertIn("Additional context here", self.builder._sections[0].content)

    def test_add_context_none(self):
        """Test that None context is skipped"""
        self.builder.add_context(None)
        self.assertEqual(len(self.builder._sections), 0)

    def test_add_golden_examples(self):
        """Test adding golden examples"""
        example1 = Mock()
        example1.input = "Example input"
        example1.expectedOutput = "Example output"
        example1.metadata = {"key": "value"}

        self.builder.add_golden_examples([example1])
        self.assertEqual(len(self.builder._sections), 1)
        self.assertEqual(self.builder._sections[0].title, "REFERENCE EXAMPLES:")
        self.assertIn("Example 1:", self.builder._sections[0].content)
        self.assertIn("Example input", self.builder._sections[0].content)
        self.assertIn("Example output", self.builder._sections[0].content)

    def test_add_golden_examples_none(self):
        """Test that None golden examples are skipped"""
        self.builder.add_golden_examples(None)
        self.assertEqual(len(self.builder._sections), 0)

    def test_add_evaluation_criteria_without_agent(self):
        """Test adding evaluation criteria without agent instructions"""
        self.builder.add_evaluation_criteria(self.mock_params, has_agent_instructions=False)
        self.assertEqual(len(self.builder._sections), 1)
        content = self.builder._sections[0].content
        self.assertIn("Relevance", content)
        self.assertIn("Accuracy", content)
        self.assertNotIn("Compliance", content)
        self.assertIn("accuracy,relevance", content)

    def test_add_evaluation_criteria_with_agent(self):
        """Test adding evaluation criteria with agent instructions"""
        self.builder.add_evaluation_criteria(self.mock_params, has_agent_instructions=True)
        self.assertEqual(len(self.builder._sections), 1)
        content = self.builder._sections[0].content
        self.assertIn("Relevance", content)
        self.assertIn("Compliance", content)
        self.assertIn("Appropriateness", content)
        self.assertIn("Refusal Handling", content)

    def test_add_scoring_instructions(self):
        """Test adding scoring instructions"""
        self.builder._evaluation_scope = "accuracy,relevance"
        self.builder._min_score = 0.8
        self.builder.add_scoring_instructions()

        self.assertEqual(len(self.builder._sections), 1)
        content = self.builder._sections[0].content
        self.assertIn("Assessment", content)
        self.assertIn("SCORE:", content)
        self.assertIn("PASSED:", content)
        self.assertIn("REASONING:", content)
        self.assertIn("CRITERIA_SCORES:", content)
        self.assertIn("0.8", content)

    def test_add_scoring_instructions_without_scope_raises_error(self):
        """Test that adding scoring instructions without scope raises error"""
        with self.assertRaises(ValueError) as ctx:
            self.builder.add_scoring_instructions()
        self.assertIn("Evaluation scope must be set", str(ctx.exception))

    def test_build_without_role_raises_error(self):
        """Test that building without role raises error"""
        with self.assertRaises(ValueError) as ctx:
            self.builder.build()
        self.assertIn("Evaluator role must be set", str(ctx.exception))

    def test_build_sections_ordered_correctly(self):
        """Test that sections are rendered in correct order"""
        self.builder.set_evaluator_role("Test role")
        self.builder.add_user_query("Query")
        self.builder.add_response(self.mock_request)
        self.builder.add_context("Context")

        prompt = self.builder.build()

        query_pos = prompt.find("USER QUERY:")
        response_pos = prompt.find("RESPONSE TO EVALUATE:")
        context_pos = prompt.find("ADDITIONAL CONTEXT:")

        self.assertLess(query_pos, response_pos)
        self.assertLess(response_pos, context_pos)

    def test_build_complete_prompt(self):
        """Test building a complete prompt with all sections"""
        agent_instructions = Mock(spec=AgentInstructions)
        agent_instructions.name = "test-agent"
        agent_instructions.description = "Test description"

        prompt = (self.builder
            .set_evaluator_role("Test evaluator")
            .add_user_query("Test query")
            .add_response(self.mock_request)
            .add_agent_instructions(agent_instructions)
            .add_evaluation_criteria(self.mock_params, has_agent_instructions=True)
            .add_scoring_instructions()
            .build()
        )

        self.assertIn("Test evaluator", prompt)
        self.assertIn("USER QUERY:", prompt)
        self.assertIn("Test query", prompt)
        self.assertIn("RESPONSE TO EVALUATE:", prompt)
        self.assertIn("AGENT INSTRUCTIONS:", prompt)
        self.assertIn("Assessment", prompt)
        self.assertIn("CRITERIA_SCORES:", prompt)


class TestBuildEvaluationPromptFunction(unittest.TestCase):
    """Test the convenience function build_evaluation_prompt"""

    def setUp(self):
        self.request = Mock(spec=EvaluationRequest)
        self.request.input = "Test query"
        self.request.responses = [
            Mock(target=Mock(type="agent", name="test-agent"), content="Test response")
        ]

        self.params = Mock(spec=EvaluationParameters)
        self.params.evaluator_role = "Test evaluator"
        self.params.min_score = 0.7
        self.params.context = None
        self.params.get_scope_list = Mock(return_value=["accuracy", "relevance"])

    def test_build_basic_prompt(self):
        """Test building basic prompt without optional parameters"""
        prompt = build_evaluation_prompt(
            request=self.request,
            params=self.params
        )

        self.assertIn("Test evaluator", prompt)
        self.assertIn("Test query", prompt)
        self.assertIn("Test response", prompt)
        self.assertIn("accuracy,relevance", prompt)

    def test_build_prompt_with_agent_instructions(self):
        """Test building prompt with agent instructions"""
        agent_instructions = Mock(spec=AgentInstructions)
        agent_instructions.name = "test-agent"
        agent_instructions.description = "Test description"

        prompt = build_evaluation_prompt(
            request=self.request,
            params=self.params,
            agent_instructions=agent_instructions,
            requires_agent_instructions=True
        )

        self.assertIn("AGENT INSTRUCTIONS:", prompt)
        self.assertIn("test-agent", prompt)
        self.assertIn("Compliance", prompt)

    def test_build_prompt_with_context(self):
        """Test building prompt with additional context"""
        self.params.context = "Additional context"

        prompt = build_evaluation_prompt(
            request=self.request,
            params=self.params
        )

        self.assertIn("ADDITIONAL CONTEXT:", prompt)
        self.assertIn("Additional context", prompt)

    def test_build_prompt_with_golden_examples(self):
        """Test building prompt with golden examples"""
        example = Mock()
        example.input = "Example input"
        example.expectedOutput = "Example output"
        example.metadata = None

        prompt = build_evaluation_prompt(
            request=self.request,
            params=self.params,
            golden_examples=[example]
        )

        self.assertIn("REFERENCE EXAMPLES:", prompt)
        self.assertIn("Example input", prompt)
        self.assertIn("Example output", prompt)

    def test_build_prompt_requires_agent_instructions_false(self):
        """Test that agent instructions are not added when requires_agent_instructions=False"""
        agent_instructions = Mock(spec=AgentInstructions)
        agent_instructions.name = "test-agent"
        agent_instructions.description = "Test description"

        prompt = build_evaluation_prompt(
            request=self.request,
            params=self.params,
            agent_instructions=agent_instructions,
            requires_agent_instructions=False
        )

        self.assertNotIn("AGENT INSTRUCTIONS:", prompt)
        self.assertNotIn("Compliance", prompt)


if __name__ == '__main__':
    unittest.main()
