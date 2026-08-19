import re
from typing import Dict, List, Optional

from ark_sdk.constants import ARK_DOMAIN

ARK_LABEL_PREFIX = ARK_DOMAIN
ARK_RESOURCE_TYPE_LABEL = f"{ARK_LABEL_PREFIX}resource-type"
ARK_TAG_LABEL_PREFIX = f"{ARK_LABEL_PREFIX}label."

CONFIGURATION_RESOURCE_TYPE = "configuration"
CONFIGURATION_LABEL_SELECTOR = f"{ARK_RESOURCE_TYPE_LABEL}={CONFIGURATION_RESOURCE_TYPE}"

TAG_PATTERN = re.compile(r"^[a-zA-Z0-9]([-_.a-zA-Z0-9]*[a-zA-Z0-9])?$")
TAG_MAX_LENGTH = 63 - len("label.")


def validate_tag(tag: str) -> str:
    """Reject tags that Kubernetes would refuse as a label key segment."""
    if not tag:
        raise ValueError("Tag cannot be empty")
    if len(tag) > TAG_MAX_LENGTH:
        raise ValueError(
            f"Tag '{tag}' is too long: {len(tag)} characters, maximum is {TAG_MAX_LENGTH}"
        )
    if not TAG_PATTERN.match(tag):
        raise ValueError(
            f"Tag '{tag}' is invalid: use letters, digits, '-', '_' or '.', "
            "starting and ending with a letter or digit"
        )
    return tag


def tags_to_labels(tags: Optional[List[str]]) -> Dict[str, str]:
    """Turn a list of tags into the Ark tag labels Kubernetes stores."""
    if not tags:
        return {}
    return {f"{ARK_TAG_LABEL_PREFIX}{validate_tag(tag)}": "true" for tag in tags}


def labels_to_tags(labels: Optional[Dict[str, str]]) -> List[str]:
    """Read back the tags from Ark tag labels, ignoring every other label."""
    if not labels:
        return []
    return sorted(
        key[len(ARK_TAG_LABEL_PREFIX):]
        for key in labels
        if key.startswith(ARK_TAG_LABEL_PREFIX)
    )


def strip_tag_labels(labels: Optional[Dict[str, str]]) -> Dict[str, str]:
    """Drop the tag labels this feature owns, keeping every other label."""
    if not labels:
        return {}
    return {
        key: value
        for key, value in labels.items()
        if not key.startswith(ARK_TAG_LABEL_PREFIX)
    }
