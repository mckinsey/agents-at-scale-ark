#!/usr/bin/env python3
"""
patch-webhook-match-conditions.sh
Adds matchConditions to all Ark admission webhooks in config/webhook/manifests.yaml
after controller-gen regenerates the file. controller-gen does not support the
matchConditions field in its +kubebuilder:webhook marker, so this script applies
the patch as a post-processing step.

Uses a line-by-line state machine to insert matchConditions only within webhook
entries inside MutatingWebhookConfiguration / ValidatingWebhookConfiguration
documents, preserving the original file formatting exactly.
"""
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(SCRIPT_DIR, "..", "config", "webhook", "manifests.yaml")

MATCH_CONDITIONS = (
    "  matchConditions:\n"
    "  - name: not-being-deleted\n"
    '    expression: "!has(object.metadata.deletionTimestamp)"\n'
)

NAME_LABEL_EXPRESSION = (
    "!has(object.metadata.deletionTimestamp) || "
    "(has(object.metadata.labels) && 'ark.mckinsey.com/name' in object.metadata.labels && "
    "object.metadata.labels['ark.mckinsey.com/name'] != object.metadata.name)"
)

MATCH_CONDITIONS_BY_WEBHOOK = {
    "mmcpserver-v1.kb.io": (
        "  matchConditions:\n"
        "  - name: not-being-deleted-unless-name-label-differs\n"
        f'    expression: "{NAME_LABEL_EXPRESSION}"\n'
    ),
}

WEBHOOK_KINDS = {"MutatingWebhookConfiguration", "ValidatingWebhookConfiguration"}


def entry_name(start):
    for line in lines[start:]:
        stripped = line.strip()
        if stripped == "- admissionReviewVersions:" or stripped.startswith("kind:"):
            return None
        if line.startswith("  name: "):
            return stripped.split(":", 1)[1].strip()
    return None

with open(MANIFEST) as f:
    lines = f.readlines()

out = []
in_webhook_doc = False
in_webhook_entry = False

for i, line in enumerate(lines):
    out.append(line)

    stripped = line.strip()

    if stripped.startswith("kind:"):
        kind = stripped.split(":", 1)[1].strip()
        in_webhook_doc = kind in WEBHOOK_KINDS
        in_webhook_entry = False

    if in_webhook_doc and stripped == "- admissionReviewVersions:":
        in_webhook_entry = True

    if in_webhook_entry and stripped == "failurePolicy: Fail":
        next_line = lines[i + 1] if i + 1 < len(lines) else ""
        if "matchConditions:" not in next_line:
            out.append(MATCH_CONDITIONS_BY_WEBHOOK.get(entry_name(i + 1), MATCH_CONDITIONS))

with open(MANIFEST, "w") as f:
    f.writelines(out)

print("Webhook matchConditions patched")
