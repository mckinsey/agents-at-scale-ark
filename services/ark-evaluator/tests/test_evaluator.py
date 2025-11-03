import pytest
from src.evaluator.evaluator import LLMEvaluator
from src.evaluator.types import EvaluationParameters


class TestEvaluatorScoreParsing:
    """Test suite for evaluator score parsing methods"""

    def setup_method(self):
        """Set up test fixtures"""
        self.evaluator = LLMEvaluator()
        self.params = EvaluationParameters(
            evaluator_name="test-evaluator",
            evaluation_scope="accuracy,completeness,usefulness,compliance",
            min_score=0.7
        )

    def test_parse_individual_criteria_scores_valid(self):
        """Test parsing valid CRITERIA_SCORES string"""
        metadata = {}
        criteria_str = "accuracy=0.8, completeness=0.9, usefulness=0.7, compliance=0.6"

        self.evaluator._parse_individual_criteria_scores(criteria_str, metadata)

        assert metadata['accuracy'] == '0.8'
        assert metadata['completeness'] == '0.9'
        assert metadata['usefulness'] == '0.7'
        assert metadata['compliance'] == '0.6'

    def test_parse_individual_criteria_scores_empty(self):
        """Test parsing empty CRITERIA_SCORES"""
        metadata = {}
        self.evaluator._parse_individual_criteria_scores('', metadata)
        assert len(metadata) == 0

    def test_parse_individual_criteria_scores_invalid_format(self):
        """Test parsing malformed CRITERIA_SCORES"""
        metadata = {}
        criteria_str = "accuracy:0.8, invalid, completeness"

        self.evaluator._parse_individual_criteria_scores(criteria_str, metadata)
        assert 'accuracy' not in metadata
        assert 'invalid' not in metadata
        assert 'completeness' not in metadata

    def test_parse_individual_criteria_scores_out_of_range(self):
        """Test scores outside 0-1 range are rejected"""
        metadata = {}
        criteria_str = "accuracy=1.5, completeness=-0.1, usefulness=0.8"

        self.evaluator._parse_individual_criteria_scores(criteria_str, metadata)

        assert 'accuracy' not in metadata
        assert 'completeness' not in metadata
        assert metadata['usefulness'] == '0.8'

    def test_parse_individual_criteria_scores_non_numeric(self):
        """Test non-numeric scores are rejected"""
        metadata = {}
        criteria_str = "accuracy=high, completeness=0.9"

        self.evaluator._parse_individual_criteria_scores(criteria_str, metadata)

        assert 'accuracy' not in metadata
        assert metadata['completeness'] == '0.9'

    def test_parse_evaluation_result_with_score_zero_uses_criteria_avg(self):
        """Test SCORE:0 falls back to criteria average"""
        result = """SCORE: 0
PASSED: false
REASONING: Test reasoning
CRITERIA_SCORES: accuracy=0.8, completeness=0.9, usefulness=0.7, compliance=0.6"""

        score, passed, metadata = self.evaluator._parse_evaluation_result(result, self.params)

        assert score == "0.75"
        assert passed is True
        assert metadata.get('score_adjusted') == 'true'
        assert metadata.get('original_score') == '0.0'

    def test_parse_evaluation_result_with_individual_scores(self):
        """Test individual scores are extracted into metadata"""
        result = """SCORE: 0.75
PASSED: true
REASONING: Test reasoning
CRITERIA_SCORES: accuracy=0.8, completeness=0.9, usefulness=0.7, compliance=0.6"""

        score, passed, metadata = self.evaluator._parse_evaluation_result(result, self.params)

        assert score == "0.75"
        assert metadata['accuracy'] == '0.8'
        assert metadata['completeness'] == '0.9'
        assert metadata['usefulness'] == '0.7'
        assert metadata['compliance'] == '0.6'

    def test_parse_evaluation_result_missing_score_uses_criteria_avg(self):
        """Test missing SCORE line uses criteria average"""
        result = """PASSED: true
REASONING: Test reasoning
CRITERIA_SCORES: accuracy=1.0, completeness=1.0, usefulness=1.0, compliance=1.0"""

        score, passed, metadata = self.evaluator._parse_evaluation_result(result, self.params)

        assert score == "1.00"
        assert passed is True
        assert metadata.get('score_adjusted') == 'true'
        assert metadata.get('adjustment_reason') == 'zero_score_fallback'

    def test_parse_evaluation_result_score_zero_no_criteria(self):
        """Test SCORE:0 with no criteria scores stays 0"""
        result = """SCORE: 0
PASSED: false
REASONING: Complete failure"""

        score, passed, metadata = self.evaluator._parse_evaluation_result(result, self.params)

        assert score == "0.00"
        assert passed is False
        assert 'score_adjusted' not in metadata

    def test_parse_evaluation_result_with_mismatch_adjustment(self):
        """Test score mismatch triggers adjustment"""
        result = """SCORE: 0.5
PASSED: false
REASONING: Test reasoning
CRITERIA_SCORES: accuracy=0.8, completeness=0.9, usefulness=0.7, compliance=0.8"""

        score, passed, metadata = self.evaluator._parse_evaluation_result(result, self.params)

        assert score == "0.80"
        assert passed is True
        assert metadata.get('score_adjusted') == 'true'
        assert metadata.get('original_score') == '0.5'

    def test_calculate_criteria_average_valid(self):
        """Test calculating average from criteria string"""
        criteria_str = "accuracy=0.8, completeness=0.9, usefulness=0.7, compliance=0.6"

        avg = self.evaluator._calculate_criteria_average(criteria_str)

        assert avg == 0.75

    def test_calculate_criteria_average_empty(self):
        """Test calculating average from empty string"""
        avg = self.evaluator._calculate_criteria_average('')

        assert avg is None

    def test_calculate_criteria_average_invalid_format(self):
        """Test calculating average from invalid format"""
        criteria_str = "accuracy:0.8, invalid, completeness"

        avg = self.evaluator._calculate_criteria_average(criteria_str)

        assert avg is None

    def test_calculate_criteria_average_out_of_range(self):
        """Test scores outside 0-1 range are excluded from average"""
        criteria_str = "accuracy=1.5, completeness=0.9, usefulness=0.7"

        avg = self.evaluator._calculate_criteria_average(criteria_str)

        assert avg == 0.8

    def test_parse_evaluation_result_all_ones(self):
        """Test the specific case from the bug: all 1.0 scores with SCORE:0"""
        result = """SCORE: 0
PASSED: false
REASONING: All criteria met
CRITERIA_SCORES: accuracy=1.0, completeness=1.0, usefulness=1.0, compliance=1.0"""

        score, passed, metadata = self.evaluator._parse_evaluation_result(result, self.params)

        assert score == "1.00"
        assert passed is True
        assert metadata['accuracy'] == '1.0'
        assert metadata['completeness'] == '1.0'
        assert metadata['usefulness'] == '1.0'
        assert metadata['compliance'] == '1.0'
        assert metadata.get('score_adjusted') == 'true'
        assert metadata.get('original_score') == '0.0'


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
