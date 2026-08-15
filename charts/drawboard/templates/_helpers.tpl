{{- define "drawboard.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "drawboard.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "drawboard.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "drawboard.labels" -}}
app.kubernetes.io/name: {{ include "drawboard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* DATABASE_URL: external URL wins, else build from the bundled subchart. */}}
{{- define "drawboard.databaseUrl" -}}
{{- if .Values.externalDatabase.url -}}
{{- .Values.externalDatabase.url -}}
{{- else -}}
{{- $host := printf "%s-postgresql" .Release.Name -}}
{{- printf "postgres://%s:%s@%s:5432/%s?sslmode=disable" .Values.postgresql.auth.username .Values.postgresql.auth.password $host .Values.postgresql.auth.database -}}
{{- end -}}
{{- end -}}

{{- define "drawboard.jwtSecretName" -}}
{{- if .Values.jwt.existingSecret -}}
{{- .Values.jwt.existingSecret -}}
{{- else -}}
{{- printf "%s-jwt" (include "drawboard.fullname" .) -}}
{{- end -}}
{{- end -}}
