{{/*
Resource name. Defaults to "ark-completions" so the central install keeps a
stable Service name; per-tenant installs may override via fullnameOverride.
*/}}
{{- define "ark-completions.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else if .Values.nameOverride -}}
{{- .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
ark-completions
{{- end -}}
{{- end -}}

{{/*
Namespace for the chart's resources. Follows the release namespace unless
explicitly overridden with .Values.namespace (backward compatibility).
*/}}
{{- define "ark-completions.namespace" -}}
{{- .Values.namespace | default .Release.Namespace -}}
{{- end -}}

{{/*
ServiceAccount name. When serviceAccount.create is true the chart provisions a
namespace-local SA (per-tenant); otherwise it reuses the shared
serviceAccountName (ark-controller by default).
*/}}
{{- define "ark-completions.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "ark-completions.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "ark-controller" .Values.serviceAccountName -}}
{{- end -}}
{{- end -}}
