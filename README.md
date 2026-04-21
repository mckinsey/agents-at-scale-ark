<div align="center">
  <h1 align="center"><code>⚒️ ark</code></h1>
  <h4 align="center">Agentic Runtime for Kubernetes</h4>
  <p align="center">
    <strong>A declarative, Kubernetes-native framework for building portable, scalable, and provider-agnostic agentic applications.</strong>
  </p>

  <hr>

  <p align="center">
    <a href="#features">Features</a> •
    <a href="#quickstart">Quickstart</a> •
    <a href="https://mckinsey.github.io/agents-at-scale-ark/">Documentation</a>
  </p>
  <p align="center">
    <a href="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/cicd.yaml"><img src="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/cicd.yaml/badge.svg" alt="CI/CD"></a>
    <a href="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/deploy.yml"><img src="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a>
    <a href="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/deploy_gcp.yml"><img src="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/deploy_gcp.yml/badge.svg" alt="Deploy GCP"></a>
    <a href="https://codecov.io/gh/mckinsey/agents-at-scale-ark"><img src="https://codecov.io/gh/mckinsey/agents-at-scale-ark/branch/main/graph/badge.svg" alt="Coverage"></a>
    <a href="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/sonar_scan.yaml"><img src="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/sonar_scan.yaml/badge.svg" alt="SonarQube Scan"></a>
    <a href="https://www.npmjs.com/package/@agents-at-scale/ark"><img src="https://img.shields.io/npm/v/@agents-at-scale/ark.svg" alt="npm version"></a>
    <a href="https://pypi.org/project/ark-sdk/"><img src="https://img.shields.io/pypi/v/ark-sdk.svg" alt="PyPI version"></a>
  </p>
</div>

## What is Ark?

Ark is a declarative toolkit for building and hosting distributed AI agents. By defining what agents should do rather than how they do it, Ark eliminates vendor lock-in and ensures your applications stay adaptable as AI evolves.

Built on Kubernetes, Ark lets you deploy a dev-friendly cluster in minutes or scale agentic workloads across existing infrastructure. Leverage proven patterns for security, monitoring, and RBAC—avoiding bespoke overhead while maintaining a portable, production-ready foundation for your AI projects.

## Why Ark?

Ark is designed for rapid, democratic development of agentic systems. The entire stack is built on open-source Kubernetes technology designed for running distributed systems. It can run comfortably on a single developer's machine or be deployed into a Kubernetes cluster across multi-cloud and on-prem environments. Developers and operations teams have full visibility into the entire stack, from the highest to the lowest levels.

Because each workload is a declarative specification of agent behavior rather than proprietary code, teams can re-platform individual use cases onto specialized or proprietary stacks when needed, typically with minimal migration overhead.

## Features

- **Declarative Agents** — Define agents as Kubernetes custom resources with prompts, tools, and model references
- **Provider Agnostic** — Swap between OpenAI, Anthropic, Google, Azure, or local Ollama without code changes
- **Multi-Agent Teams** — Orchestrate agents with sequential, graph, selector, or round-robin strategies
- **Tool Integration** — Connect agents to HTTP APIs, MCP servers, or other agents as tools
- **Persistent Memory** — Maintain conversation context across sessions with pluggable memory backends
- **A2A Protocol** — Interoperate with external agent systems via Agent-to-Agent protocol
- **CLI & SDKs** — Manage agents from the command line or integrate via Python and TypeScript SDKs

## Quickstart

You will need a Kubernetes cluster to install Ark into. You can use [Minikube](https://minikube.sigs.k8s.io/docs/start), [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/), [Docker Desktop](https://docs.docker.com/desktop/kubernetes/) or similar to run a local cluster.

Ensure you have [Node.js](https://nodejs.org/en/download) and [Helm](https://helm.sh/docs/intro/install/) installed. Then run the following commands to install Ark:

```bash
# Install the 'ark' CLI:
npm install -g @agents-at-scale/ark

# Install Ark:
ark install

# Optionally configure a 'default' model to use for agents:
ark models create default

# Run the dashboard:
ark dashboard
```

In most cases the default installation options will be sufficient. This will install the Ark dependencies, the controller, the APIs and the dashboard. You can optionally setup a `default` model that will be the default used by agents. The `install` command will warn if any required dependencies are missing.

User guides, developer guides, operations guides and API reference documentation is all available at:

https://mckinsey.github.io/agents-at-scale-ark/

To troubleshoot an installation, run `ark status`.

## Credits

The initial design and implementation of Ark was led by [Roman Galeev](https://github.com/Roman-Galeev), [Dave Kerr](https://github.com/dwmkerr), and [Chris Madden](https://github.com/cm94242).
