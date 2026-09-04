from typing import Dict, Optional

from ark_sdk.constants import ARK_DOMAIN

ARK_ANNOTATION_PREFIX = ARK_DOMAIN


def filter_ark_annotations(annotations: Optional[Dict[str, str]]) -> Dict[str, str]:
    """Keep only Ark-owned annotations, dropping everything else."""
    if not annotations:
        return {}
    return {
        key: value
        for key, value in annotations.items()
        if key.startswith(ARK_ANNOTATION_PREFIX)
    }
