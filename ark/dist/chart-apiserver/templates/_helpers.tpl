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

{{- define "ark-apiserver.postgresEnv" -}}
- name: ARK_POSTGRES_HOST
  value: {{ required "postgresql.host is required" .Values.postgresql.host | quote }}
- name: ARK_POSTGRES_PORT
  value: {{ .Values.postgresql.port | quote }}
- name: ARK_POSTGRES_DATABASE
  value: {{ .Values.postgresql.database | quote }}
- name: ARK_POSTGRES_USER
  value: {{ required "postgresql.user is required" .Values.postgresql.user | quote }}
- name: ARK_POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ required "postgresql.passwordSecretName is required" .Values.postgresql.passwordSecretName }}
      key: {{ .Values.postgresql.passwordSecretKey }}
- name: ARK_POSTGRES_SSL_MODE
  value: {{ .Values.postgresql.sslMode | quote }}
{{- if and .Values.postgresql.sslSecretName .Values.postgresql.sslRootCertKey }}
- name: ARK_POSTGRES_SSL_ROOT_CERT
  value: /etc/ark/postgres-tls/{{ .Values.postgresql.sslRootCertKey }}
{{- end }}
{{- if and .Values.postgresql.sslSecretName .Values.postgresql.sslClientCertKey }}
- name: ARK_POSTGRES_SSL_CERT
  value: /etc/ark/postgres-tls/{{ .Values.postgresql.sslClientCertKey }}
{{- end }}
{{- if and .Values.postgresql.sslSecretName .Values.postgresql.sslClientKeyKey }}
- name: ARK_POSTGRES_SSL_KEY
  value: /etc/ark/postgres-tls/{{ .Values.postgresql.sslClientKeyKey }}
{{- end }}
{{- end }}
