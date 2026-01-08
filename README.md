<div align="center">
  <h1 align="center"><code>⚒️ ark</code></h1>
  <h4 align="center">Agentic Runtime for Kubernetes</h4>
  <p align="center">
    <strong>Technical Preview & RFC. Part of the Agents at Scale Ecosystem</strong>
  </p>
  <p align="center">
    <em>Run agentic workloads across any system or cluster.</em>
  </p>

  <hr>

  <p align="center">
    <a href="#quickstart">Quickstart</a> •
    <a href="https://mckinsey.github.io/agents-at-scale-ark/">Documentation</a>
  </p>
  <p align="center">
    <a href="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/cicd.yaml"><img src="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/cicd.yaml/badge.svg" alt="CI/CD"></a>
    <a href="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/deploy.yml"><img src="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a>
    <a href="https://www.npmjs.com/package/@agents-at-scale/ark"><img src="https://img.shields.io/npm/v/@agents-at-scale/ark.svg" alt="npm version"></a>
    <a href="https://pypi.org/project/ark-sdk/"><img src="https://img.shields.io/pypi/v/ark-sdk.svg" alt="PyPI version"></a>
  </p>
</div>

## Quickstart

You will need a Kubernetes cluster to install Ark into. You can use [Minikube](https://minikube.sigs.k8s.io/docs/start), [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/), [Docker Desktop](https://docs.docker.com/desktop/kubernetes/) or similar to run a local cluster. 

Ensure you have [Node.js](https://nodejs.org/en/download) and [Helm](https://helm.sh/docs/intro/install/) installed, as well as [kubectl](https://kubernetes.io/docs/reference/kubectl/) if not already installed as part of your Kubernetes setup. Then run the following commands to install Ark:

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

## What is Ark?

ARK is a runtime environment built on Kubernetes to host AI agents - with built-in CRDs for agents, models, memory, tools, and evaluation, it abstracts away plumbing so teams can build agentic applications faster and reliably.

## Technical Preview

Agents at Scale - Agentic Runtime for Kubernetes ("Ark") is released as a technical preview and early access release. This software is provided as a Request for Comments (RFC) to share elements of our technical approach with the broader technology community, gather valuable feedback, and seek input from practitioners and researchers in the field of agentic AI systems and Kubernetes orchestration.

As a technical preview release, this software may contain incomplete features, experimental functionality, and is subject to significant changes based on community feedback and continued development. The software is provided "as is" without warranties of any kind, and users should expect potential instability, breaking changes, and limited support during this preview phase.

## Credits

The initial design and implementation of Ark was led by [Roman Galeev](https://github.com/Roman-Galeev), [Dave Kerr](https://github.com/dwmkerr), and [Chris Madden](https://github.com/cm94242).
