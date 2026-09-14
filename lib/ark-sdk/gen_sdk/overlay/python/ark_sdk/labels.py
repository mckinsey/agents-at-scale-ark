import re
from typing import Dict, List, Optional

from ark_sdk.constants import ARK_DOMAIN

ARK_LABEL_PREFIX = ARK_DOMAIN
ARK_TAG_LABEL_PREFIX = f"{ARK_LABEL_PREFIX}label."

TAG_PATTERN = re.compile(r"^[a-zA-Z0-9]+$")
LEGACY_TAG_PATTERN = re.compile(r"^[a-zA-Z0-9]([-_.a-zA-Z0-9]*[a-zA-Z0-9])?$")
TAG_MAX_LENGTH = 63 - len("label.")


def _check_tag_length(tag: str) -> None:
    if not tag:
        raise ValueError("Tag cannot be empty")
    if len(tag) > TAG_MAX_LENGTH:
        raise ValueError(
            f"Tag '{tag}' is too long: {len(tag)} characters, maximum is {TAG_MAX_LENGTH}"
        )


def validate_tag(tag: str) -> str:
    """Reject tags that don't meet the alphanumeric-only rule."""
    _check_tag_length(tag)
    if not TAG_PATTERN.match(tag):
        raise ValueError(
            f"Tag '{tag}' is invalid: use only letters and digits"
        )
    return tag


def validate_legacy_tag(tag: str) -> str:
    """Accept tags Kubernetes would allow as a label key segment.

    Used to parse a tag list on update without rejecting tags created before
    the alphanumeric-only rule existed; validate_updated_tags still enforces
    the current rule on anything actually new.
    """
    _check_tag_length(tag)
    if not LEGACY_TAG_PATTERN.match(tag):
        raise ValueError(
            f"Tag '{tag}' is invalid: use letters, digits, '-', '_' or '.', "
            "starting and ending with a letter or digit"
        )
    return tag


def validate_updated_tags(tags: List[str], existing_tags: List[str]) -> List[str]:
    """Validate a tag list for update, grandfathering unchanged legacy tags.

    A tag already present on the resource is kept as-is even if it predates
    the alphanumeric-only rule. Any tag being added must satisfy that rule.
    """
    existing = set(existing_tags)
    return [tag if tag in existing else validate_tag(tag) for tag in tags]


def tags_to_labels(tags: Optional[List[str]]) -> Dict[str, str]:
    """Turn an already-validated list of tags into Ark tag labels."""
    if not tags:
        return {}
    return {f"{ARK_TAG_LABEL_PREFIX}{tag}": "true" for tag in tags}


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
