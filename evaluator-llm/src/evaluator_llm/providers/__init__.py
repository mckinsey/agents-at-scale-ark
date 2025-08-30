from .factory import EvaluationProviderFactory
from .direct_evaluation import DirectEvaluationProvider
from .query_evaluation import QueryEvaluationProvider
from .baseline_evaluation import BaselineEvaluationProvider
from .batch_evaluation import BatchEvaluationProvider
from .event_evaluation import EventEvaluationProvider

# Register all evaluation providers
EvaluationProviderFactory.register("direct", DirectEvaluationProvider)
EvaluationProviderFactory.register("query", QueryEvaluationProvider)
EvaluationProviderFactory.register("baseline", BaselineEvaluationProvider)
EvaluationProviderFactory.register("batch", BatchEvaluationProvider)
EvaluationProviderFactory.register("event", EventEvaluationProvider)

__all__ = [
    "EvaluationProviderFactory",
    "DirectEvaluationProvider",
    "QueryEvaluationProvider", 
    "BaselineEvaluationProvider",
    "BatchEvaluationProvider",
    "EventEvaluationProvider"
]