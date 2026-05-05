{{- define "ark-apiserver.name" -}}
ark-apiserver
{{- end }}

{{- define "ark-apiserver.labels" -}}
app.kubernetes.io/name: {{ include "ark-apiserver.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- if .Chart.Version }}
helm.sh/chart: {{ .Chart.Version | quote }}
{{- end }}
{{- end }}

{{- define "ark-apiserver.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ark-apiserver.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "ark-apiserver.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end }}
