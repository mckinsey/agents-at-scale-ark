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

WEBHOOK_KINDS = {"MutatingWebhookConfiguration", "ValidatingWebhookConfiguration"}

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
            out.append(MATCH_CONDITIONS)

with open(MANIFEST, "w") as f:
    f.writelines(out)

print("Webhook matchConditions patched")
