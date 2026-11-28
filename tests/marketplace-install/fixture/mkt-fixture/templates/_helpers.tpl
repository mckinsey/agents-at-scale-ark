{{/*
The variants this chart knows. Rendered from deployment.yaml, so every render
fails on an unknown variant name.
*/}}
{{- define "fx.checkVariant" -}}
{{- $known := list "ok" "slow" "fail" "hook" "conflict" "cluster" "crd" "skiplabel" "rbac" "rbac-installer-sa" "nosc" "reserved-secret" "personal-ref" "ark" -}}
{{- if not (has .Values.variant $known) -}}
{{- fail (printf "unknown fixture variant %q, see values.yaml" .Values.variant) -}}
{{- end -}}
{{- end -}}

{{/*
Labels shared by the base objects. The skiplabel variant adds the label that
tells Ark's webhooks to skip validation, which charts must never set.
*/}}
{{- define "fx.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if eq .Values.variant "skiplabel" }}
ark.mckinsey.com/skip-webhook-validation: "true"
{{- end }}
{{- end -}}

{{/*
Container securityContext that satisfies the restricted Pod Security level.
Tenant namespaces may enforce restricted, so every container in the chart uses
it, except the Deployment of the nosc variant.
*/}}
{{- define "fx.sc" -}}
securityContext:
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  capabilities: {drop: [ALL]}
  seccompProfile: {type: RuntimeDefault}
{{- end -}}

{{/*
A reserved personal Secret name: "u-" plus 16 hex characters, the prefix Ark
gives to a user's personal Secrets. The hex part is made up; it matches no user.
*/}}
{{- define "fx.personalSecret" -}}
u-0123456789abcdef-token
{{- end -}}
