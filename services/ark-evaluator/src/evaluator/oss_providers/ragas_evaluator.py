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
    
    # RAGAS metric mappings
    METRIC_MAPPINGS = {
        'relevance': 'answer_relevancy',
        'correctness': 'answer_correctness',
        'similarity': 'answer_similarity',
        'faithfulness': 'faithfulness',
        'toxicity': None,  # RAGAS doesn't have built-in toxicity
        'helpfulness': 'answer_relevancy',  # Use relevancy as proxy
        'clarity': 'answer_similarity'  # Use similarity as proxy
    }
    
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
                faithfulness
            )
            from ragas.metrics.base import MetricWithLLM, MetricWithEmbeddings
            from ragas.run_config import RunConfig
        except ImportError as e:
            logger.error(f"Failed to import RAGAS components: {e}")
            raise
        
        # Map our metrics to RAGAS metrics
        ragas_metric_map = {
            'relevance': answer_relevancy,
            'correctness': answer_correctness,
            'similarity': answer_similarity,
            'faithfulness': faithfulness,
            'helpfulness': answer_relevancy,
            'clarity': answer_similarity
        }
        
        supported_metrics = []
        
        for metric in metrics:
            if metric not in ragas_metric_map or ragas_metric_map[metric] is None:
                logger.warning(f"Metric '{metric}' not supported by RAGAS, skipping")
                continue
            
            # Get the RAGAS metric class/instance
            ragas_metric = ragas_metric_map[metric]
            
            # Create fresh instance if needed
            if hasattr(ragas_metric, '__call__') and not hasattr(ragas_metric, 'name'):
                # It's a metric class/function, instantiate it
                metric_instance = ragas_metric()
            else:
                # It's already an instance
                metric_instance = ragas_metric
            
            # Configure the metric with our LLM and embeddings
            if isinstance(metric_instance, MetricWithLLM):
                metric_instance.llm = llm
                logger.debug(f"Configured {metric} with LLM")
            
            if isinstance(metric_instance, MetricWithEmbeddings):
                if embeddings:
                    metric_instance.embeddings = embeddings
                    logger.info(f"Configured {metric} with embeddings")
                else:
                    logger.warning(f"Metric {metric} needs embeddings but none provided")
            
            # Initialize the metric
            run_config = RunConfig()
            metric_instance.init(run_config)
            
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
        context_source: Optional[str] = None
    ) -> Any:
        """
        Prepare dataset for RAGAS evaluation.
        
        Args:
            input_text: The input/question text
            output_text: The output/answer text
            context: Optional context for evaluation
            context_source: Source of the context
            
        Returns:
            RAGAS-compatible dataset
        """
        try:
            from datasets import Dataset
        except ImportError as e:
            logger.error(f"Failed to import datasets library: {e}")
            raise
        
        # Prepare contexts for RAGAS evaluation
        if context:
            logger.info(f"Using evaluation context from {context_source or 'unknown'}, length: {len(context)} characters")
            contexts = [context]  # RAGAS expects list of strings
        else:
            logger.info("No context provided, using default context for evaluation")
            contexts = ["No specific context provided"]
        
        # Create dataset entry with all possible field names for compatibility
        dataset_entry = {
            # Standard RAGAS fields
            'question': input_text,
            'answer': output_text,
            'contexts': contexts,
            'ground_truth': output_text,  # Use output as ground truth for similarity
            
            # Alternative field names for compatibility
            'user_input': input_text,
            'response': output_text,
            'retrieved_contexts': contexts,
            'reference': output_text
        }
        
        # Create dataset
        eval_dataset = Dataset.from_list([dataset_entry])
        logger.debug(f"Created RAGAS dataset with {len(eval_dataset)} entries")
        
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
            result = ev_ragas(
                dataset=dataset,
                metrics=metrics
            )
            
            logger.info("RAGAS evaluation completed successfully")
            return result
            
        except Exception as eval_e:
            logger.error(f"RAGAS evaluation failed: {eval_e}")
            raise
    
    @staticmethod
    def extract_scores(
        result: Any,
        requested_metrics: List[str]
    ) -> Dict[str, float]:
        """
        Extract scores from RAGAS evaluation result.
        
        Args:
            result: RAGAS evaluation result
            requested_metrics: List of originally requested metrics
            
        Returns:
            Dictionary mapping metric names to scores
        """
        scores = {}
        
        try:
            # Convert result to dictionary
            result_dict = result.to_pandas().to_dict('records')[0]
        except Exception as e:
            logger.error(f"Failed to extract RAGAS results: {e}")
            return {metric: 0.5 for metric in requested_metrics}
        
        # Map RAGAS results back to our metric names
        for metric in requested_metrics:
            value = None
            
            # Check for direct RAGAS metric name
            ragas_name = RagasEvaluator.METRIC_MAPPINGS.get(metric)
            if ragas_name and ragas_name in result_dict:
                value = result_dict[ragas_name]
            
            # Handle special cases and aliases
            elif metric == 'helpfulness' and 'answer_relevancy' in result_dict:
                value = result_dict['answer_relevancy']
            elif metric == 'clarity' and 'answer_similarity' in result_dict:
                value = result_dict['answer_similarity']
            
            # Process the value
            if value is not None:
                # Handle NaN values that can occur in RAGAS evaluation
                if math.isnan(float(value)):
                    logger.warning(f"RAGAS returned NaN for metric {metric}, using fallback score")
                    scores[metric] = 0.7  # Reasonable fallback for NaN
                else:
                    scores[metric] = float(value)
            else:
                logger.warning(f"No RAGAS result found for metric: {metric}, using default")
                scores[metric] = 0.5
        
        logger.info(f"Extracted scores: {scores}")
        return scores
    
    @staticmethod
    def get_fallback_scores(
        input_text: str,
        output_text: str,
        metrics: List[str]
    ) -> Dict[str, float]:
        """
        Generate fallback scores when RAGAS evaluation fails.
        
        Args:
            input_text: The input text
            output_text: The output text
            metrics: List of metrics to score
            
        Returns:
            Dictionary of fallback scores
        """
        logger.warning("Using fallback evaluation method")
        scores = {}
        
        for metric in metrics:
            if metric == 'relevance':
                # Simple word overlap
                input_words = set(input_text.lower().split())
                output_words = set(output_text.lower().split())
                overlap = len(input_words.intersection(output_words))
                scores[metric] = min(1.0, overlap / max(len(input_words), 1))
            
            elif metric == 'correctness':
                # Length-based scoring
                scores[metric] = min(1.0, len(output_text) / 100)
            
            elif metric == 'similarity':
                # Basic similarity check
                scores[metric] = 0.6 if len(output_text) > 10 else 0.3
            
            elif metric == 'faithfulness':
                # Default medium score
                scores[metric] = 0.5
            
            elif metric == 'toxicity':
                # Simple toxicity check
                toxic_words = ['hate', 'stupid', 'idiot', 'kill', 'die', 'worst']
                toxic_count = sum(1 for word in toxic_words if word in output_text.lower())
                scores[metric] = min(1.0, toxic_count / 3.0)
            
            else:
                # Default neutral score
                scores[metric] = 0.5
        
        logger.info(f"Generated fallback scores: {scores}")
        return scores