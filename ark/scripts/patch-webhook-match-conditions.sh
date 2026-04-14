#!/usr/bin/env python3
"""
patch-webhook-match-conditions.sh
Adds matchConditions to all Ark admission webhooks in config/webhook/manifests.yaml
after controller-gen regenerates the file. controller-gen does not support the
matchConditions field in its +kubebuilder:webhook marker, so this script applies
the patch as a post-processing step.
"""
import os
import yaml

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(SCRIPT_DIR, "..", "config", "webhook", "manifests.yaml")

MATCH_CONDITIONS = [{"name": "not-being-deleted", "expression": "!has(object.metadata.deletionTimestamp)"}]

with open(MANIFEST) as f:
    docs = list(yaml.safe_load_all(f))

for doc in docs:
    if doc.get("kind") not in ("MutatingWebhookConfiguration", "ValidatingWebhookConfiguration"):
        continue
    for webhook in doc.get("webhooks", []):
        if "matchConditions" not in webhook:
            webhook["matchConditions"] = MATCH_CONDITIONS

with open(MANIFEST, "w") as f:
    yaml.dump_all(docs, f, default_flow_style=False, allow_unicode=True)

print("Webhook matchConditions patched")
