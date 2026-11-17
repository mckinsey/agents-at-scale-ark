{{/*
Expand the name of the chart.
*/}}
{{- define "ark-tenant.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "ark-tenant.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "ark-tenant.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ark-tenant.labels" -}}
helm.sh/chart: {{ include "ark-tenant.chart" . }}
{{ include "ark-tenant.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "ark-tenant.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ark-tenant.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "ark-tenant.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default "default" .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the marketplace installer service account. ark-api impersonates it by
this name, so it must match the constants of ark-api's marketplace_install module.
*/}}
{{- define "ark-tenant.marketplaceInstaller.serviceAccount" -}}
ark-marketplace-installer
{{- end }}

{{/*
Username of the installer service account, as its tokens and ark-api's
impersonation present it to the API server.
*/}}
{{- define "ark-tenant.marketplaceInstaller.username" -}}
system:serviceaccount:{{ .Release.Namespace }}:{{ include "ark-tenant.marketplaceInstaller.serviceAccount" . }}
{{- end }}

{{/*
Name of the namespace's ValidatingAdmissionPolicy and of its binding. The bootstrap
copy appends -bootstrap. ark-api looks both pairs up by name before it enables installs.
*/}}
{{- define "ark-tenant.marketplaceInstall.policyName" -}}
ark-marketplace-installer-sa-{{ .Release.Namespace }}
{{- end }}
