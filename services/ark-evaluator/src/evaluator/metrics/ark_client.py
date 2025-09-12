"""
ARK SDK integration for loading Query CRDs
"""
import logging
from typing import Dict, Any
from ..types import QueryRef
from .query_resolver import QueryResolver

logger = logging.getLogger(__name__)


class ArkClient:
    def __init__(self):
        self.query_resolver = QueryResolver()
    
    async def load_query(self, query_ref: QueryRef):
        """Load Query CRD from Kubernetes using ARK SDK"""
        try:
            logger.info(f"Loading query {query_ref.name} from namespace {query_ref.namespace}")
            query_config = await self.query_resolver.resolve_query(query_ref)
            logger.info(f"Successfully loaded query {query_ref.name}")
            return query_config
        except Exception as e:
            logger.error(f"Failed to load query {query_ref.name}: {e}")
            raise
    
    async def extract_metrics(self, query_config) -> Dict[str, Any]:
        """Extract performance metrics from Query status"""
        try:
            # Debug: Log the type of query_config we received
            logger.info(f"extract_metrics received object of type: {type(query_config)}")
            
            # Handle both dict and QueryV1alpha1 object formats
            if isinstance(query_config, dict):
                query_name = query_config.get('metadata', {}).get('name', 'unknown')
                logger.info(f"Processing dict format for query {query_name}")
            else:
                query_name = query_config.metadata.name if hasattr(query_config, 'metadata') else 'unknown'
                logger.info(f"Processing QueryV1alpha1 format for query {query_name}")
                
            logger.info(f"Extracting metrics from query {query_name}")
            try:
                metrics = self.query_resolver.extract_metrics_from_query(query_config)
            except Exception as e:
                logger.error(f"Error in extract_metrics_from_query: {e}")
                import traceback
                logger.error(f"Full traceback: {traceback.format_exc()}")
                raise
            
            # Add some derived metrics
            self._add_derived_metrics(metrics)
            
            logger.info(f"Successfully extracted {len(metrics)} metrics")
            return metrics
            
        except Exception as e:
            logger.error(f"Failed to extract metrics: {e}")
            raise
    
    def _add_derived_metrics(self, metrics: Dict[str, Any]) -> None:
        """Add derived metrics and calculations"""
        # Add timestamp for evaluation
        import time
        metrics["evaluationTimestamp"] = time.time()
        
        # Initialize lists for tracking thresholds
        metrics["threshold_violations"] = []
        metrics["passed_thresholds"] = []
        
        # Add placeholder for cost calculation (will be implemented in metrics calculator)
        if "totalTokens" in metrics:
            # Placeholder cost calculation - will be refined in Task 6
            estimated_cost = metrics["totalTokens"] * 0.00002  # Rough estimate
            metrics["estimatedCost"] = estimated_cost