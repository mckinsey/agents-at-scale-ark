{{/*
Expand the name of the chart.
*/}}
{{- define "ark-broker.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "ark-broker.fullname" -}}
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
{{- define "ark-broker.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ark-broker.labels" -}}
helm.sh/chart: {{ include "ark-broker.chart" . }}
{{ include "ark-broker.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "ark-broker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ark-broker.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Convert a Kubernetes memory quantity to a float count of MiB.
Accepts binary suffixes (Ki/Mi/Gi/Ti), decimal suffixes (k/M/G/T) and plain bytes.
*/}}
{{- define "ark-broker.memoryToMi" -}}
{{- $q := . | toString -}}
{{- if hasSuffix "Ki" $q -}}
{{- divf (float64 (trimSuffix "Ki" $q)) 1024.0 -}}
{{- else if hasSuffix "Mi" $q -}}
{{- float64 (trimSuffix "Mi" $q) -}}
{{- else if hasSuffix "Gi" $q -}}
{{- mulf (float64 (trimSuffix "Gi" $q)) 1024.0 -}}
{{- else if hasSuffix "Ti" $q -}}
{{- mulf (float64 (trimSuffix "Ti" $q)) 1048576.0 -}}
{{- else if hasSuffix "k" $q -}}
{{- divf (mulf (float64 (trimSuffix "k" $q)) 1000.0) 1048576.0 -}}
{{- else if hasSuffix "M" $q -}}
{{- divf (mulf (float64 (trimSuffix "M" $q)) 1000000.0) 1048576.0 -}}
{{- else if hasSuffix "G" $q -}}
{{- divf (mulf (float64 (trimSuffix "G" $q)) 1000000000.0) 1048576.0 -}}
{{- else if hasSuffix "T" $q -}}
{{- divf (mulf (float64 (trimSuffix "T" $q)) 1000000000000.0) 1048576.0 -}}
{{- else -}}
{{- divf (float64 $q) 1048576.0 -}}
{{- end -}}
{{- end }}

{{/*
NODE_OPTIONS for the broker container.

V8 sizes its default old space from host memory, not the container limit, so the
process can exhaust its heap while the container still has headroom. Derive
--max-old-space-size from app.resources.limits.memory.

--max-old-space-size caps only the old space: V8's total heap ceiling lands ~24MB
above it (measured on node:26.5.0-alpine), and non-heap RSS (native buffers,
sockets, protobuf parsing) sits above that. Both terms below keep the whole
process under the container limit so a full heap self-limits rather than being
OOMKilled: 85% covers large limits, and limit-128Mi covers small ones, where a
percentage alone leaves too little for non-heap memory. Every size keeps at
least ~100MB clear of the limit.

Renders empty at limits of 128Mi and below, where no value leaves useful headroom.

app.nodeOptions overrides the computed value verbatim. Renders empty when neither
app.nodeOptions nor a memory limit is set.
*/}}
{{- define "ark-broker.nodeOptions" -}}
{{- if .Values.app.nodeOptions -}}
{{- .Values.app.nodeOptions -}}
{{- else -}}
{{- $limit := dig "resources" "limits" "memory" "" .Values.app -}}
{{- if $limit -}}
{{- $limitMi := include "ark-broker.memoryToMi" $limit | float64 -}}
{{- $heapMi := min (int64 (mulf $limitMi 0.85)) (int64 (subf $limitMi 128.0)) -}}
{{- if gt $heapMi 0 -}}
{{- printf "--max-old-space-size=%d" $heapMi -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "ark-broker.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "ark-broker.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}