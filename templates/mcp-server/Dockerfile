{{- if eq .Values.technology "node" }}
FROM node:22.22.0-alpine

# Install the MCP server package
{{- if .Values.packageSource }}
{{- if eq .Values.packageSource "npm" }}
RUN npm install -g {{ .Values.packageName }}
{{- else if eq .Values.packageSource "local" }}
COPY . /app
WORKDIR /app
RUN npm install
{{- end }}
{{- else }}
COPY . /app
WORKDIR /app
RUN npm install
{{- end }}

# Install mcp-proxy for HTTP transport
RUN npm install -g mcp-proxy

EXPOSE 8080

{{- if eq .Values.packageSource "npm" }}
ENTRYPOINT [ "/bin/sh", "-c", "mcp-proxy --debug --port 8080 --host 0.0.0.0 --shell \"{{ .Values.packageName }} stdio\"" ]
{{- else }}
ENTRYPOINT [ "/bin/sh", "-c", "mcp-proxy --debug --port 8080 --host 0.0.0.0 --shell \"node index.js stdio\"" ]
{{- end }}

{{- else if eq .Values.technology "deno" }}
FROM denoland/deno:2.1.8

USER root

# Install Node.js for mcp-proxy
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install mcp-proxy
RUN npm install -g mcp-proxy

{{- if .Values.packageSource }}
{{- if eq .Values.packageSource "jsr" }}
RUN deno install --global -A --node-modules-dir=auto {{ .Values.packageName }}
{{- else if eq .Values.packageSource "local" }}
COPY . /app
WORKDIR /app
{{- end }}
{{- else }}
COPY . /app
WORKDIR /app
{{- end }}

EXPOSE 8080

{{- if eq .Values.packageSource "jsr" }}
ENTRYPOINT [ "/bin/bash", "-c", "mcp-proxy --debug --port 8080 --host 0.0.0.0 --shell \"deno run -A --node-modules-dir=auto {{ .Values.packageName }} stdio\"" ]
{{- else }}
ENTRYPOINT [ "/bin/bash", "-c", "mcp-proxy --debug --port 8080 --host 0.0.0.0 --shell \"deno run -A index.ts stdio\"" ]
{{- end }}

{{- else if eq .Values.technology "go" }}
FROM golang:latest AS go-builder
{{- if .Values.packageSource }}
{{- if eq .Values.packageSource "go-install" }}
RUN go install {{ .Values.packageName }}@latest
{{- else if eq .Values.packageSource "local" }}
COPY . /app
WORKDIR /app
RUN go build -o {{ .Values.mcpServerName }} .
{{- end }}
{{- else }}
COPY . /app
WORKDIR /app
RUN go build -o {{ .Values.mcpServerName }} .
{{- end }}

FROM node:22.22.0-alpine
{{- if eq .Values.packageSource "go-install" }}
COPY --from=go-builder /go/bin/{{ .Values.packageName }} /usr/local/bin/
{{- else }}
COPY --from=go-builder /app/{{ .Values.mcpServerName }} /usr/local/bin/
{{- end }}
RUN npm install -g mcp-proxy

EXPOSE 8080

{{- if eq .Values.packageSource "go-install" }}
ENTRYPOINT [ "/bin/sh", "-c", "mcp-proxy --debug --port 8080 --host 0.0.0.0 --shell \"/usr/local/bin/{{ .Values.packageName }} stdio\"" ]
{{- else }}
ENTRYPOINT [ "/bin/sh", "-c", "mcp-proxy --debug --port 8080 --host 0.0.0.0 --shell \"/usr/local/bin/{{ .Values.mcpServerName }} stdio\"" ]
{{- end }}

{{- else if eq .Values.technology "python" }}
FROM python:3.11-slim

WORKDIR /app

{{- if .Values.packageSource }}
{{- if eq .Values.packageSource "pip" }}
RUN pip install {{ .Values.packageName }}
{{- else if eq .Values.packageSource "local" }}
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
{{- end }}
{{- else }}
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
{{- end }}

# Install Node.js for mcp-proxy
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g mcp-proxy

EXPOSE 8080

{{- if eq .Values.packageSource "pip" }}
ENTRYPOINT [ "/bin/bash", "-c", "mcp-proxy --debug --port 8080 --host 0.0.0.0 --shell \"{{ .Values.packageName }} stdio\"" ]
{{- else }}
ENTRYPOINT [ "/bin/bash", "-c", "mcp-proxy --debug --port 8080 --host 0.0.0.0 --shell \"python main.py stdio\"" ]
{{- end }}

{{- end }}