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

{{/*
postgresCleanupEnv is the environment for the post-delete cleanup Job, which runs
the controller binary (--role=postgres-cleanup) and drops the ark_cdc publication
(DDL/ownership). It emits the full ARK_POSTGRES_* set using the privileged migration
(owner) role when configured, falling back to the runtime credentials otherwise.
*/}}
{{- define "ark-apiserver.postgresCleanupEnv" -}}
{{- $migUser := .Values.postgresql.migration.user | default .Values.postgresql.user -}}
{{- $migSecret := .Values.postgresql.migration.passwordSecretName | default .Values.postgresql.passwordSecretName -}}
{{- $migKey := .Values.postgresql.migration.passwordSecretKey | default .Values.postgresql.passwordSecretKey -}}
- name: ARK_POSTGRES_HOST
  value: {{ required "postgresql.host is required" .Values.postgresql.host | quote }}
- name: ARK_POSTGRES_PORT
  value: {{ .Values.postgresql.port | quote }}
- name: ARK_POSTGRES_DATABASE
  value: {{ .Values.postgresql.database | quote }}
- name: ARK_POSTGRES_USER
  value: {{ required "a migration user is required (postgresql.migration.user or postgresql.user)" $migUser | quote }}
- name: ARK_POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ required "a migration password secret is required (postgresql.migration.passwordSecretName or postgresql.passwordSecretName)" $migSecret }}
      key: {{ $migKey }}
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

{{- define "ark-apiserver.migrateImage" -}}
{{- $tag := .Values.migrate.image.tag | default .Values.image.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" .Values.migrate.image.repository $tag -}}
{{- end }}

{{/*
postgresMigrateEnv supplies only PGPASSWORD to the migration hook Job, sourced from
the dedicated migration (owner) secret when configured, falling back to the runtime
secret otherwise. The value is referenced as $(PGPASSWORD) in the golang-migrate URL
so the password is substituted by Kubernetes at runtime and never rendered into the
manifest.
*/}}
{{- define "ark-apiserver.postgresMigrateEnv" -}}
{{- $migSecret := .Values.postgresql.migration.passwordSecretName | default .Values.postgresql.passwordSecretName -}}
{{- $migKey := .Values.postgresql.migration.passwordSecretKey | default .Values.postgresql.passwordSecretKey -}}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ required "a migration password secret is required (postgresql.migration.passwordSecretName or postgresql.passwordSecretName)" $migSecret }}
      key: {{ $migKey }}
{{- end }}

{{/*
postgresMigrateUrl builds the golang-migrate -database URL. The migration (owner)
role is used when configured, falling back to the runtime role. TLS material, when
configured, is passed as client-side file paths that golang-migrate reads from the
mounted secret.
*/}}
{{- define "ark-apiserver.postgresMigrateUrl" -}}
{{- $migUser := .Values.postgresql.migration.user | default .Values.postgresql.user -}}
{{- $user := required "a migration user is required (postgresql.migration.user or postgresql.user)" $migUser -}}
{{- $host := required "postgresql.host is required" .Values.postgresql.host -}}
{{- $params := list (printf "sslmode=%s" .Values.postgresql.sslMode) -}}
{{- if and .Values.postgresql.sslSecretName .Values.postgresql.sslRootCertKey -}}
{{- $params = append $params (printf "sslrootcert=/etc/ark/postgres-tls/%s" .Values.postgresql.sslRootCertKey) -}}
{{- end -}}
{{- if and .Values.postgresql.sslSecretName .Values.postgresql.sslClientCertKey -}}
{{- $params = append $params (printf "sslcert=/etc/ark/postgres-tls/%s" .Values.postgresql.sslClientCertKey) -}}
{{- end -}}
{{- if and .Values.postgresql.sslSecretName .Values.postgresql.sslClientKeyKey -}}
{{- $params = append $params (printf "sslkey=/etc/ark/postgres-tls/%s" .Values.postgresql.sslClientKeyKey) -}}
{{- end -}}
{{- printf "postgres://%s:$(PGPASSWORD)@%s:%v/%s?%s" $user $host .Values.postgresql.port .Values.postgresql.database (join "&" $params) -}}
{{- end }}
