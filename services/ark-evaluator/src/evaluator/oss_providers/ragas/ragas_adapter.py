"""
RAGAS-based LLM evaluation adapter for Langfuse integration.
Supports multiple LLM providers with improved separation of concerns.
"""

import logging
from typing import Dict, List
from .ragas_adapter_refactored import RagasAdapter as RefactoredRagasAdapter

logger = logging.getLogger(__name__)


class RagasAdapter:
    """
    RAGAS adapter with delegation to the refactored implementation.
    This maintains backward compatibility while using the improved architecture.
    """
    
    def __init__(self):
        # Delegate to the refactored implementation
        self._adapter = RefactoredRagasAdapter()
    
    
    
    async def evaluate(self, input_text: str, output_text: str, metrics: List[str], params: dict) -> Dict[str, float]:
        """
        Run RAGAS evaluation using the refactored implementation.
        """
        return await self._adapter.evaluate(input_text, output_text, metrics, params)

    def get_validation_results(self):
        """
        Get validation results from the refactored implementation.
        """
        return self._adapter.get_validation_results()
