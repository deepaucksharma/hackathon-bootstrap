{{/*
Expand the name of the chart.
*/}}
{{- define "message-queues-platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "message-queues-platform.fullname" -}}
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
{{- define "message-queues-platform.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "message-queues-platform.labels" -}}
helm.sh/chart: {{ include "message-queues-platform.chart" . }}
{{ include "message-queues-platform.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "message-queues-platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "message-queues-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "message-queues-platform.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "message-queues-platform.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create secret name for New Relic credentials
*/}}
{{- define "message-queues-platform.secretName" -}}
{{- printf "%s-secrets" (include "message-queues-platform.fullname" .) }}
{{- end }}

{{/*
Create configmap name
*/}}
{{- define "message-queues-platform.configMapName" -}}
{{- printf "%s-config" (include "message-queues-platform.fullname" .) }}
{{- end }}