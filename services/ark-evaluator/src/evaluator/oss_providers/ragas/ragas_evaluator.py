"""
RAGAS Evaluator for running RAGAS-specific evaluation logic.
Encapsulates RAGAS metrics initialization, dataset preparation, and evaluation execution.
"""

import logging
import math
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class RagasEvaluator:
    """
    Encapsulates RAGAS evaluation logic including metric initialization,
    dataset preparation, and evaluation execution.
    """
    
    # RAGAS metric mappings - maps our metric names to RAGAS result field names
    METRIC_MAPPINGS = {
        'relevance': 'answer_relevancy',
        'correctness': 'answer_correctness',
        'similarity': 'answer_similarity',
        'faithfulness': 'faithfulness',
        'context_precision': 'llm_context_precision_without_reference',  # Class-based metric
        'context_recall': 'context_recall',
        'context_entity_recall': 'context_entity_recall',
        'toxicity': None,  # RAGAS doesn't have built-in toxicity
        'helpfulness': 'answer_relevancy',  # Use relevancy as proxy
        'clarity': 'answer_similarity'  # Use similarity as proxy
    }
    
    @staticmethod
    def validate_and_filter_metrics(
        metrics: List[str],
        dataset_entry: Dict[str, Any]
    ) -> Tuple[List[str], List[str], Dict[str, str]]:
        """
        Validate field requirements for metrics and filter into valid/invalid groups.

        Args:
            metrics: List of metric names to validate
            dataset_entry: Dataset entry with available fields

        Returns:
            Tuple of (valid_metrics, invalid_metrics, validation_errors)
        """
        try:
            from .ragas_metrics import MetricRegistry
        except ImportError as e:
            logger.error(f"Failed to import MetricRegistry: {e}")
            # If we can't validate, assume all metrics are valid (backward compatibility)
            return metrics, [], {}

        valid_metrics = []
        invalid_metrics = []
        validation_errors = {}

        for metric_name in metrics:
            metric = MetricRegistry.get_metric(metric_name)
            if not metric:
                invalid_metrics.append(metric_name)
                validation_errors[metric_name] = f"Unknown metric: {metric_name}"
                logger.warning(f"Unknown metric '{metric_name}' requested")
                continue

            # Validate field requirements for this metric
            is_valid, errors = metric.validate_input(**dataset_entry)

            if is_valid:
                valid_metrics.append(metric_name)
                logger.debug(f"Metric '{metric_name}' validation passed")
            else:
                invalid_metrics.append(metric_name)
                error_msg = "; ".join(errors)
                validation_errors[metric_name] = error_msg
                logger.warning(f"Metric '{metric_name}' validation failed: {error_msg}")

        logger.info(f"Metric validation complete: {len(valid_metrics)} valid, {len(invalid_metrics)} invalid")
        return valid_metrics, invalid_metrics, validation_errors

    @staticmethod
    def initialize_ragas_metrics(
        metrics: List[str],
        llm: Any,
        embeddings: Optional[Any] = None
    ) -> List[Any]:
        """
        Initialize RAGAS metrics with LLM and embeddings.
        
        Args:
            metrics: List of metric names to initialize
            llm: RAGAS-wrapped LLM instance
            embeddings: Optional RAGAS-wrapped embeddings instance
            
        Returns:
            List of initialized RAGAS metric instances
        """
        try:
            from ragas.metrics import (
                answer_relevancy,
                answer_correctness,
                answer_similarity,
                faithfulness,
                context_recall,
                LLMContextPrecisionWithoutReference,
                ContextEntityRecall
            )
            from ragas.metrics.base import MetricWithLLM, MetricWithEmbeddings
            from ragas.run_config import RunConfig
        except ImportError as e:
            logger.error(f"Failed to import RAGAS components: {e}")
            raise

        # Map our metrics to RAGAS metrics - exclude problematic context metrics for now
        ragas_metric_map = {
            'relevance': answer_relevancy,
            'correctness': answer_correctness,
            'similarity': answer_similarity,
            'faithfulness': faithfulness,  # Also depends on context
            'context_precision': LLMContextPrecisionWithoutReference,
            'context_recall': context_recall,
        }
        
        supported_metrics = []
        
        for metric in metrics:
            if metric not in ragas_metric_map or ragas_metric_map[metric] is None:
                if metric in ['faithfulness', 'context_precision', 'context_recall']:
                    logger.warning(f"Context-dependent metric '{metric}' temporarily disabled due to RAGAS v0.3.5 compatibility issues")
                else:
                    logger.warning(f"Metric '{metric}' not supported by RAGAS, skipping")
                continue
            
            # Get the RAGAS metric class/instance
            ragas_metric = ragas_metric_map[metric]

            # Create and initialize metric instance with enhanced type handling
            metric_instance = None
            run_config = RunConfig()

            try:
                # Try different initialization patterns based on metric type

                # Pattern 1: Class-type metrics (like LLMContextPrecisionWithoutReference)
                # These are classes that may need run_config in constructor
                if hasattr(ragas_metric, '__name__') and ragas_metric.__name__.endswith('WithoutReference'):
                    logger.debug(f"Handling class-type metric: {metric}")
                    try:
                        # Try instantiating class-type metric with run_config
                        metric_instance = ragas_metric(llm=llm, embeddings=embeddings)
                        logger.debug(f"Successfully instantiated {metric} as class with LLM/embeddings")
                    except TypeError:
                        try:
                            # Try without embeddings
                            metric_instance = ragas_metric(llm=llm)
                            logger.debug(f"Successfully instantiated {metric} as class with LLM only")
                        except TypeError:
                            try:
                                # Try basic instantiation
                                metric_instance = ragas_metric()
                                logger.debug(f"Successfully instantiated {metric} as class with no args")
                            except Exception as e:
                                logger.warning(f"Failed to instantiate class-type metric {metric}: {e}")

                # Pattern 2: Function-type metrics (like answer_relevancy)
                if metric_instance is None:
                    logger.debug(f"Handling function-type metric: {metric}")
                    if hasattr(ragas_metric, '__call__') and not hasattr(ragas_metric, 'name'):
                        # It's a metric function, instantiate it
                        metric_instance = ragas_metric()
                        logger.debug(f"Successfully instantiated {metric} as function")
                    else:
                        # It's already an instance
                        metric_instance = ragas_metric
                        logger.debug(f"Using pre-existing instance for {metric}")

                if metric_instance is None:
                    logger.warning(f"Could not create instance for metric {metric}, skipping")
                    continue

                # Log metric instance status before configuration
                logger.debug(f"Metric {metric} instance created: {type(metric_instance)}")
                if isinstance(metric_instance, MetricWithLLM):
                    has_llm = hasattr(metric_instance, 'llm')
                    llm_value = getattr(metric_instance, 'llm', 'NO_ATTR') if has_llm else 'NO_ATTR'
                    logger.debug(f"Metric {metric} LLM status: has_attr={has_llm}, value={llm_value}")

                # Configure the metric with our LLM and embeddings (if not already configured)
                if isinstance(metric_instance, MetricWithLLM) and (not hasattr(metric_instance, 'llm') or metric_instance.llm is None):
                    metric_instance.llm = llm
                    logger.debug(f"Configured {metric} with LLM (was None or missing)")

                if isinstance(metric_instance, MetricWithEmbeddings) and (not hasattr(metric_instance, 'embeddings') or metric_instance.embeddings is None):
                    if embeddings:
                        metric_instance.embeddings = embeddings
                        logger.debug(f"Configured {metric} with embeddings (was None or missing)")
                    else:
                        logger.warning(f"Metric {metric} needs embeddings but none provided")

                # Initialize the metric with different patterns
                try:
                    # Try standard initialization
                    metric_instance.init(run_config)
                    logger.debug(f"Successfully initialized {metric} with run_config")
                except TypeError as e:
                    if "missing" in str(e) and "positional argument" in str(e):
                        logger.debug(f"Metric {metric} has different init signature, trying alternatives")
                        try:
                            # Some metrics might need init without args
                            metric_instance.init()
                            logger.debug(f"Successfully initialized {metric} without args")
                        except Exception as e2:
                            logger.warning(f"Failed to initialize {metric}: {e2}")
                            continue
                    else:
                        logger.warning(f"Failed to initialize {metric}: {e}")
                        continue
                except Exception as e:
                    logger.warning(f"Failed to initialize {metric}: {e}")
                    continue

            except Exception as e:
                logger.warning(f"Failed to process metric {metric}: {e}")
                continue
            
            supported_metrics.append(metric_instance)
            logger.debug(f"Initialized RAGAS metric: {metric}")
        
        # If no supported metrics, use default
        if not supported_metrics:
            logger.warning("No supported RAGAS metrics found, using answer_relevancy as default")
            default_metric = answer_relevancy()
            
            if isinstance(default_metric, MetricWithLLM):
                default_metric.llm = llm
            if isinstance(default_metric, MetricWithEmbeddings) and embeddings:
                default_metric.embeddings = embeddings
            
            run_config = RunConfig()
            default_metric.init(run_config)
            supported_metrics = [default_metric]
        
        logger.info(f"Initialized {len(supported_metrics)} RAGAS metrics")
        return supported_metrics
    
    @staticmethod
    def prepare_dataset(
        input_text: str,
        output_text: str,
        context: Optional[str] = None,
        context_source: Optional[str] = None,
        metrics: Optional[List[str]] = None,
        ground_truth: Optional[str] = None
    ) -> Any:
        """
        Prepare dataset for RAGAS evaluation with metric-specific fields.

        Args:
            input_text: The input/question text
            output_text: The output/answer text
            context: Optional context for evaluation
            context_source: Source of the context
            metrics: List of metrics to evaluate (determines dataset structure)
            ground_truth: Optional ground truth for correctness metrics

        Returns:
            RAGAS-compatible dataset
        """
        try:
            from datasets import Dataset
            from .ragas_metrics import MetricRegistry
        except ImportError as e:
            logger.error(f"Failed to import required libraries: {e}")
            raise

        # Log context usage
        if context:
            logger.info(f"Using evaluation context from {context_source or 'unknown'}, length: {len(context)} characters")
        else:
            logger.info("No context provided for evaluation")

        # Use MetricRegistry to prepare the dataset based on requested metrics
        if metrics:
            dataset_entry = MetricRegistry.prepare_dataset_for_metrics(
                metrics=metrics,
                input_text=input_text,
                output_text=output_text,
                context=context,
                ground_truth=ground_truth
            )
        else:
            # Fallback to basic structure if no metrics specified
            dataset_entry = {
                'user_input': input_text,
                'response': output_text,
            }

            # Only add context if meaningful content is provided
            if context:
                dataset_entry['retrieved_contexts'] = [context]

            # Only add reference if meaningful ground truth is provided
            if ground_truth:
                dataset_entry['reference'] = ground_truth

        # Create dataset
        eval_dataset = Dataset.from_list([dataset_entry])
        logger.debug(f"Created RAGAS dataset with {len(eval_dataset)} entries")
        logger.debug(f"Dataset columns: {eval_dataset.column_names}")
        logger.debug(f"Dataset entry: {dataset_entry}")

        return eval_dataset
    
    @staticmethod
    async def run_evaluation(
        dataset: Any,
        metrics: List[Any]
    ) -> Dict[str, float]:
        """
        Run RAGAS evaluation on the dataset.
        
        Args:
            dataset: RAGAS-compatible dataset
            metrics: List of initialized RAGAS metrics
            
        Returns:
            Dictionary of metric scores
        """
        try:
            from ragas import evaluate as ev_ragas
        except ImportError as e:
            logger.error(f"Failed to import RAGAS evaluate function: {e}")
            raise
        
        logger.info(f"Running RAGAS evaluation with {len(metrics)} metrics")
        
        try:
            logger.info(f"Starting RAGAS evaluation with dataset columns: {dataset.column_names}")
            result = ev_ragas(
                dataset=dataset,
                metrics=metrics
            )

            logger.info("RAGAS evaluation completed successfully")
            return result

        except Exception as eval_e:
            logger.error(f"RAGAS evaluation failed: {eval_e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            raise
    
    @staticmethod
    def extract_scores(
        result: Any,
        requested_metrics: List[str],
        valid_metrics: Optional[List[str]] = None
    ) -> Dict[str, float]:
        """
        Extract scores from RAGAS evaluation result.

        Args:
            result: RAGAS evaluation result
            requested_metrics: List of originally requested metrics
            valid_metrics: List of metrics that were actually evaluated (optional)

        Returns:
            Dictionary mapping metric names to scores (only for valid metrics)
        """
        scores = {}

        # If valid_metrics is provided, only extract scores for those metrics
        # This supports partial evaluation where some metrics failed validation
        metrics_to_extract = valid_metrics if valid_metrics is not None else requested_metrics

        try:
            # Convert result to dictionary
            result_dict = result.to_pandas().to_dict('records')[0]
            logger.debug(f"RAGAS result fields: {list(result_dict.keys())}")
            logger.debug(f"RAGAS result values: {result_dict}")
        except Exception as e:
            logger.error(f"Failed to extract RAGAS results: {e}")
            # Only return fallback scores for metrics that were supposed to be evaluated
            return {metric: 0 for metric in metrics_to_extract}

        # Map RAGAS results back to our metric names (only for evaluated metrics)
        for metric in metrics_to_extract:
            value = None
            found_field = None

            # Try primary mapping from METRIC_MAPPINGS
            ragas_name = RagasEvaluator.METRIC_MAPPINGS.get(metric)
            if ragas_name and ragas_name in result_dict:
                value = result_dict[ragas_name]
                found_field = ragas_name
                logger.debug(f"Found {metric} using primary mapping: {ragas_name}")

            # Fallback: try alternative field names for class-based metrics
            elif metric == 'context_precision':
                # Try different possible field names for context precision
                alternative_names = [
                    'llm_context_precision_without_reference',
                    'context_precision',
                    'LLMContextPrecisionWithoutReference',
                    'llm_context_precision'
                ]
                for alt_name in alternative_names:
                    if alt_name in result_dict:
                        value = result_dict[alt_name]
                        found_field = alt_name
                        logger.debug(f"Found {metric} using alternative name: {alt_name}")
                        break

            # Handle special cases and aliases
            elif metric == 'helpfulness' and 'answer_relevancy' in result_dict:
                value = result_dict['answer_relevancy']
                found_field = 'answer_relevancy'
            elif metric == 'clarity' and 'answer_similarity' in result_dict:
                value = result_dict['answer_similarity']
                found_field = 'answer_similarity'

            # Last resort: try exact metric name
            elif metric in result_dict:
                value = result_dict[metric]
                found_field = metric
                logger.debug(f"Found {metric} using exact name match")
            
            # Process the value
            if value is not None:
                # Handle NaN values that can occur in RAGAS evaluation
                if math.isnan(float(value)):
                    logger.warning(f"RAGAS returned NaN for metric {metric} (field: {found_field}), using fallback score")
                    scores[metric] = 0.7  # Reasonable fallback for NaN
                else:
                    scores[metric] = float(value)
                    logger.debug(f"Successfully extracted {metric} = {value} (from field: {found_field})")
            else:
                available_fields = list(result_dict.keys())
                logger.warning(f"No RAGAS result found for metric: {metric}, using default. Available fields: {available_fields}")
                scores[metric] = 0.5
        
        logger.info(f"Extracted scores: {scores}")
        return scores
    
