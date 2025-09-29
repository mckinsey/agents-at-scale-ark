"""
RAGAS Metrics Wrapper - Provides structured metadata and field requirements for each RAGAS metric.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class FieldRequirement:
    """Describes a field requirement for a metric."""
    name: str
    description: str
    required: bool = True
    field_type: str = "str"  # str, list[str], etc.
    example: Optional[Any] = None


class MetricWrapper(ABC):
    """Base class for RAGAS metric wrappers."""

    def __init__(self):
        self.name = self.get_name()
        self.description = self.get_description()
        self.required_fields = self.get_required_fields()
        self.optional_fields = self.get_optional_fields()

    @abstractmethod
    def get_name(self) -> str:
        """Return the metric name as used in RAGAS."""
        pass

    @abstractmethod
    def get_display_name(self) -> str:
        """Return the user-friendly display name."""
        pass

    @abstractmethod
    def get_description(self) -> str:
        """Return a description of what this metric measures."""
        pass

    @abstractmethod
    def get_required_fields(self) -> List[FieldRequirement]:
        """Return the required fields for this metric."""
        pass

    def get_optional_fields(self) -> List[FieldRequirement]:
        """Return optional fields that enhance this metric."""
        return []

    def get_fields(self) -> Dict[str, Any]:
        """Get all fields (required and optional) with their properties and requirement status."""
        all_fields = []

        # Add required fields
        for field in self.get_required_fields():
            field_info = {
                "name": field.name,
                "description": field.description,
                "type": field.field_type,
                "required": True,
                "example": field.example
            }
            all_fields.append(field_info)

        # Add optional fields
        for field in self.get_optional_fields():
            field_info = {
                "name": field.name,
                "description": field.description,
                "type": field.field_type,
                "required": False,
                "example": field.example
            }
            all_fields.append(field_info)

        return {
            "required_count": len(self.get_required_fields()),
            "optional_count": len(self.get_optional_fields()),
            "total_count": len(all_fields),
            "fields": all_fields
        }

    def get_ragas_field_mapping(self) -> Dict[str, str]:
        """Map our standard field names to RAGAS-specific field names."""
        return {}

    def prepare_dataset_entry(self, input_text: str, output_text: str,
                            context: Optional[str] = None,
                            ground_truth: Optional[str] = None,
                            **kwargs) -> Dict[str, Any]:
        """Prepare a dataset entry specific to this metric's requirements using centralized mapping."""
        entry = {}

        # Get the mapping for this metric
        field_mapping = self.get_ragas_field_mapping()

        # Standard parameter mapping
        param_values = {
            "input_text": input_text,
            "output_text": output_text,
            "context": context,
            "ground_truth": ground_truth
        }

        # Apply mapping for each required field
        for field_req in self.required_fields:
            field_name = field_req.name

            # Find the source parameter for this field
            source_param = None
            for param, ragas_field in field_mapping.items():
                if ragas_field == field_name:
                    source_param = param
                    break

            # Set the field value based on mapping
            if source_param and source_param in param_values:
                value = param_values[source_param]

                # Handle special cases for context fields (must be lists)
                if field_name in ["retrieved_contexts", "contexts"]:
                    if value:
                        entry[field_name] = [value] if isinstance(value, str) else value
                    # Don't add empty context defaults
                # Handle reference/ground_truth fields
                elif field_name in ["reference", "ground_truth"]:
                    if value:  # Only add if meaningful content
                        entry[field_name] = value
                else:
                    if value:  # Only add if meaningful content
                        entry[field_name] = value
            else:
                # Fallback for fields not in mapping
                if field_name in ["retrieved_contexts", "contexts"]:
                    # Only add context if meaningful content is provided
                    if context:
                        entry[field_name] = [context]
                elif field_name in ["reference", "ground_truth"]:
                    # Only add reference if ground_truth has meaningful content
                    if ground_truth:
                        entry[field_name] = ground_truth
                elif field_name in ["user_input"]:
                    entry[field_name] = input_text
                elif field_name in ["response"]:
                    entry[field_name] = output_text

        # Add any additional kwargs that match optional fields
        for field_req in self.optional_fields:
            if field_req.name in kwargs:
                entry[field_req.name] = kwargs[field_req.name]

        return entry

    def validate_input(self, **kwargs) -> tuple[bool, List[str]]:
        """Validate if all required fields are present and have correct types and content."""
        errors = []
        provided_fields = set(kwargs.keys())

        # Check required fields
        for field_req in self.required_fields:
            if field_req.name not in provided_fields:
                if field_req.required:
                    errors.append(f"Missing required field: {field_req.name} - {field_req.description}")
            else:
                # Validate field type and content if provided
                value = kwargs[field_req.name]
                is_valid, error_msg = self._validate_field_type(
                    value,
                    field_req.field_type,
                    field_req.name,
                    is_required=field_req.required
                )
                if not is_valid:
                    errors.append(error_msg)

        # Check optional fields
        for field_req in self.optional_fields:
            if field_req.name in provided_fields:
                value = kwargs[field_req.name]
                is_valid, error_msg = self._validate_field_type(
                    value,
                    field_req.field_type,
                    field_req.name,
                    is_required=False
                )
                if not is_valid:
                    errors.append(error_msg)

        return len(errors) == 0, errors

    def _validate_field_type(self, value: Any, expected_type: str, field_name: str, is_required: bool = False) -> tuple[bool, str]:
        """
        Validate that a field value matches the expected type and has meaningful content.

        Returns:
            Tuple of (is_valid, error_message)
        """
        if value is None:
            if is_required:
                return False, f"Field '{field_name}' is required but None"
            return True, ""  # Allow None values for optional fields

        try:
            if expected_type == "str":
                if not isinstance(value, str):
                    return False, f"Field '{field_name}' must be a string"
                # For required string fields, check for meaningful content
                if is_required and not value.strip():
                    return False, f"Field '{field_name}' is required but empty"
                return True, ""

            elif expected_type == "list[str]":
                if not isinstance(value, list):
                    return False, f"Field '{field_name}' must be a list"
                if not all(isinstance(item, str) for item in value):
                    return False, f"Field '{field_name}' must be a list of strings"
                # For required list fields, check for meaningful content
                if is_required and (not value or all(not item.strip() for item in value)):
                    return False, f"Field '{field_name}' is required but empty or contains only empty strings"
                return True, ""

            elif expected_type == "int":
                if not isinstance(value, int):
                    return False, f"Field '{field_name}' must be an integer"
                return True, ""

            elif expected_type == "float":
                if not isinstance(value, (int, float)):
                    return False, f"Field '{field_name}' must be a number"
                return True, ""

            elif expected_type == "bool":
                if not isinstance(value, bool):
                    return False, f"Field '{field_name}' must be a boolean"
                return True, ""
            else:
                # For unknown types, assume valid
                return True, ""
        except Exception:
            logger.warning(f"Type validation failed for field {field_name}")
            return False, f"Type validation failed for field {field_name}"


# Concrete metric implementations

class AnswerRelevancyMetric(MetricWrapper):
    """Wrapper for answer relevancy metric."""

    def get_name(self) -> str:
        return "answer_relevancy"

    def get_display_name(self) -> str:
        return "relevance"

    def get_description(self) -> str:
        return "Measures how relevant the answer is to the given question"

    def get_ragas_field_mapping(self) -> Dict[str, str]:
        """Map our standard parameter names to RAGAS field names."""
        return {
            "input_text": "user_input",
            "output_text": "response"
        }

    def get_required_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="user_input",
                description="The question or prompt from the user",
                field_type="str",
                example="What is machine learning?"
            ),
            FieldRequirement(
                name="response",
                description="The generated answer to the question",
                field_type="str",
                example="Machine learning is a type of artificial intelligence..."
            )
        ]

    def get_optional_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="retrieved_contexts",
                description="Additional context that can enhance relevancy assessment",
                required=False,
                field_type="list[str]",
                example=["Context document 1", "Context document 2"]
            ),
            FieldRequirement(
                name="reference",
                description="Reference answer for comparison to improve relevancy scoring",
                required=False,
                field_type="str",
                example="A reference answer for comparison"
            )
        ]


class AnswerCorrectnessMetric(MetricWrapper):
    """Wrapper for answer correctness metric."""

    def get_name(self) -> str:
        return "answer_correctness"

    def get_display_name(self) -> str:
        return "correctness"

    def get_description(self) -> str:
        return "Evaluates factual correctness by comparing with ground truth"

    def get_ragas_field_mapping(self) -> Dict[str, str]:
        """Map our standard parameter names to RAGAS field names."""
        return {
            "input_text": "user_input",
            "output_text": "response",
            "ground_truth": "reference"
        }

    def get_required_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="user_input",
                description="The original question",
                field_type="str",
                example="What is the capital of France?"
            ),
            FieldRequirement(
                name="response",
                description="The generated answer",
                field_type="str",
                example="The capital of France is Paris."
            ),
            FieldRequirement(
                name="reference",
                description="The correct/reference answer",
                field_type="str",
                example="Paris is the capital of France."
            )
        ]


class AnswerSimilarityMetric(MetricWrapper):
    """Wrapper for answer similarity metric."""

    def get_name(self) -> str:
        return "answer_similarity"

    def get_display_name(self) -> str:
        return "similarity"

    def get_description(self) -> str:
        return "Measures semantic similarity between generated and reference answers"

    def get_ragas_field_mapping(self) -> Dict[str, str]:
        """Map our standard parameter names to RAGAS field names."""
        return {
            "output_text": "response",
            "ground_truth": "reference"
        }

    def get_required_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="reference",
                description="The reference/ground truth answer",
                field_type="str",
                example="The Earth orbits around the Sun"
            ),
            FieldRequirement(
                name="response",
                description="The generated answer",
                field_type="str",
                example="The Sun is orbited by the Earth"
            )
        ]


class FaithfulnessMetric(MetricWrapper):
    """Wrapper for faithfulness metric."""

    def get_name(self) -> str:
        return "faithfulness"

    def get_display_name(self) -> str:
        return "faithfulness"

    def get_description(self) -> str:
        return "Measures if the answer is faithful to the provided context"

    def get_ragas_field_mapping(self) -> Dict[str, str]:
        """Map our standard parameter names to RAGAS field names."""
        return {
            "input_text": "user_input",
            "output_text": "response",
            "context": "retrieved_contexts"
        }

    def get_required_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="user_input",
                description="The question being answered",
                field_type="str",
                example="What causes climate change?"
            ),
            FieldRequirement(
                name="response",
                description="The generated answer",
                field_type="str",
                example="Climate change is primarily caused by..."
            ),
            FieldRequirement(
                name="retrieved_contexts",
                description="Retrieved context documents used for answering",
                field_type="list[str]",
                example=["Document 1 content...", "Document 2 content..."]
            )
        ]


class ContextPrecisionMetric(MetricWrapper):
    """Wrapper for context precision metric."""

    def get_name(self) -> str:
        return "context_precision"

    def get_display_name(self) -> str:
        return "context_precision"

    def get_description(self) -> str:
        return "Measures precision of retrieved context"

    def get_ragas_field_mapping(self) -> Dict[str, str]:
        """Map our standard parameter names to RAGAS field names."""
        return {
            "input_text": "user_input",
            "output_text": "response",
            "context": "retrieved_contexts",
            "ground_truth": "reference"
        }

    def get_required_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="user_input",
                description="The question being answered",
                field_type="str"
            ),
            FieldRequirement(
                name="response",
                description="The generated answer",
                field_type="str",
                example="Climate change is primarily caused by..."
            ),
            FieldRequirement(
                name="retrieved_contexts",
                description="Retrieved context documents",
                field_type="list[str]"
            )
        ]

    def get_optional_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="reference",
                description="Reference answer for better precision calculation",
                required=False,
                field_type="str"
            )
        ]


class ContextRecallMetric(MetricWrapper):
    """Wrapper for context recall metric."""

    def get_name(self) -> str:
        return "context_recall"

    def get_display_name(self) -> str:
        return "context_recall"

    def get_description(self) -> str:
        return "Measures recall of retrieved context against ground truth"

    def get_ragas_field_mapping(self) -> Dict[str, str]:
        """Map our standard parameter names to RAGAS field names."""
        return {
            "input_text": "user_input",
            "context": "retrieved_contexts",
            "output_text": "response"
        }

    def get_required_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="user_input",
                description="The question being answered",
                field_type="str"
            ),
            FieldRequirement(
                name="retrieved_contexts",
                description="Retrieved context documents",
                field_type="list[str]"
            ),
            FieldRequirement(
                name="response",
                description="The generated response",
                field_type="str"
            )
        ]

    def get_optional_fields(self) -> List[FieldRequirement]:
        return [
            FieldRequirement(
                name="reference",
                description="The reference answer (same as response for context recall)",
                field_type="str"
            )
        ]

    def prepare_dataset_entry(self, input_text: str, output_text: str, context: Optional[str] = None,
                            ground_truth: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """
        Override dataset preparation for context recall metric.

        Context recall requires both response and reference fields,
        and we use output_text for both since they represent the same content.
        """
        entry = {}

        # Add required fields
        entry["user_input"] = input_text
        entry["response"] = output_text
        entry["reference"] = output_text  # Use same content as response

        # Add context if available
        if context:
            entry["retrieved_contexts"] = [context]

        return entry

# Metric registry
class MetricRegistry:
    """Registry for all available RAGAS metrics."""

    _metrics: Dict[str, MetricWrapper] = {}
    _initialized = False

    @classmethod
    def initialize(cls):
        """Initialize the metric registry."""
        if cls._initialized:
            return

        # Register all metrics
        metrics = [
            AnswerRelevancyMetric(),
            AnswerCorrectnessMetric(),
            AnswerSimilarityMetric(),
            FaithfulnessMetric(),
            ContextPrecisionMetric(),
            ContextRecallMetric(),
        ]

        for metric in metrics:
            cls._metrics[metric.get_display_name()] = metric
            # Also register by RAGAS name for backward compatibility
            cls._metrics[metric.get_name()] = metric

        # Add aliases
        cls._metrics["relevance"] = cls._metrics["answer_relevancy"]
        cls._metrics["correctness"] = cls._metrics["answer_correctness"]
        cls._metrics["similarity"] = cls._metrics["answer_similarity"]
        cls._metrics["helpfulness"] = cls._metrics["answer_relevancy"]  # Use relevancy as proxy
        cls._metrics["clarity"] = cls._metrics["answer_similarity"]  # Use similarity as proxy

        cls._initialized = True
        logger.info(f"Initialized MetricRegistry with {len(set(cls._metrics.values()))} unique metrics")

    @classmethod
    def get_metric(cls, name: str) -> Optional[MetricWrapper]:
        """Get a metric wrapper by name."""
        cls.initialize()
        return cls._metrics.get(name)

    @classmethod
    def get_all_metrics(cls) -> Dict[str, MetricWrapper]:
        """Get all available metrics."""
        cls.initialize()
        # Return unique metrics only
        unique_metrics = {}
        seen = set()
        for metric in cls._metrics.values():
            if metric not in seen:
                unique_metrics[metric.get_display_name()] = metric
                seen.add(metric)
        return unique_metrics

    @classmethod
    def get_metric_info(cls, name: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a metric."""
        metric = cls.get_metric(name)
        if not metric:
            return None

        fields_info = metric.get_fields()

        return {
            "name": metric.get_display_name(),
            "ragas_name": metric.get_name(),
            "description": metric.get_description(),
            "field_mapping": metric.get_ragas_field_mapping(),
            "field_summary": {
                "required_count": fields_info["required_count"],
                "optional_count": fields_info["optional_count"],
                "total_count": fields_info["total_count"]
            },
            "fields": fields_info["fields"]
        }

    @classmethod
    def prepare_dataset_for_metrics(cls, metrics: List[str],
                                   input_text: str, output_text: str,
                                   context: Optional[str] = None,
                                   ground_truth: Optional[str] = None,
                                   **kwargs) -> Dict[str, Any]:
        """Prepare a unified dataset entry that works for all requested metrics."""
        cls.initialize()

        # Prepare dataset entry for all requested metrics
        dataset_entry = {}

        for metric_name in metrics:
            metric = cls.get_metric(metric_name)
            if not metric:
                logger.warning(f"Unknown metric: {metric_name}")
                continue

            # Get the dataset entry for this specific metric
            metric_entry = metric.prepare_dataset_entry(
                input_text, output_text, context, ground_truth, **kwargs
            )

            # Merge into the unified entry
            dataset_entry.update(metric_entry)

        # Ensure we have at least basic fields
        if not dataset_entry:
            # Fallback to a basic structure with only meaningful fields
            dataset_entry = {
                "user_input": input_text,
                "response": output_text,
            }
            # Only add context if meaningful content is provided
            if context:
                dataset_entry["retrieved_contexts"] = [context]
            # Only add reference if meaningful ground truth is provided
            if ground_truth:
                dataset_entry["reference"] = ground_truth

        logger.debug(f"Prepared dataset entry with fields: {list(dataset_entry.keys())}")
        return dataset_entry

    @classmethod
    def validate_dataset_for_metrics(cls, metrics: List[str], dataset_entry: Dict[str, Any]) -> tuple[bool, List[str]]:
        """Validate that a dataset entry contains all required fields for the specified metrics."""
        cls.initialize()

        all_errors = []

        for metric_name in metrics:
            metric = cls.get_metric(metric_name)
            if not metric:
                all_errors.append(f"Unknown metric: {metric_name}")
                continue

            # Validate this metric's requirements
            is_valid, errors = metric.validate_input(**dataset_entry)
            if not is_valid:
                all_errors.extend([f"[{metric_name}] {error}" for error in errors])

        return len(all_errors) == 0, all_errors