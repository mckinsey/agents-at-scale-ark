"""Query target utilities for parsing model strings."""

from ark_sdk import QueryV1alpha1SpecTarget
from fastapi import HTTPException


def parse_model_to_query_target(model: str) -> QueryV1alpha1SpecTarget:
    """Parse model string to QueryTarget, supporting agent/, team/, model/, and tool/ prefixes."""
    if model.startswith("agent/"):
        return QueryV1alpha1SpecTarget(type="agent", name=model[6:])
    elif model.startswith("team/"):
        return QueryV1alpha1SpecTarget(type="team", name=model[5:])
    elif model.startswith("model/"):
        return QueryV1alpha1SpecTarget(type="model", name=model[6:])
    elif model.startswith("tool/"):
        return QueryV1alpha1SpecTarget(type="tool", name=model[5:])
    else:
        raise HTTPException(
            status_code=400,
            detail="Model must be in format 'agent/<name>', 'team/<name>', 'model/<name>', or 'tool/<name>'",
        )