from typing import Dict, Optional

ARK_ANNOTATION_PREFIX = "ark.mckinsey.com/"


def filter_ark_annotations(annotations: Optional[Dict[str, str]]) -> Dict[str, str]:
    """Keep only Ark-owned annotations, dropping everything else."""
    if not annotations:
        return {}
    return {
        key: value
        for key, value in annotations.items()
        if key.startswith(ARK_ANNOTATION_PREFIX)
    }
