<div align="center">
  <h1 align="center"><code>ark</code></h1>
  <h4 align="center">Ark Command Line Interface</h4>

  <hr>

  <p align="center">
    <a href="#quickstart">Quickstart</a> •
    <a href="https://mckinsey.github.io/agents-at-scale-ark/">Documentation</a>
  </p>
  <p align="center">
    <a href="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/cicd.yaml"><img src="https://github.com/mckinsey/agents-at-scale-ark/actions/workflows/cicd.yaml/badge.svg" alt="CI/CD"></a>
    <a href="https://www.npmjs.com/package/@agents-at-scale/ark"><img src="https://img.shields.io/npm/v/@agents-at-scale/ark.svg" alt="npm version"></a>
  </p>
</div>

## Quickstart

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

In most cases the default installation options will be sufficient. This will install the Ark dependencies, the controller, the APIs and the dashboard. You can optionally setup a `default` model that will be the default used by agents. You will need a Kubernetes cluster to install Ark into, you can use [Minikube](https://minikube.sigs.k8s.io/docs/start), [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/), [Docker Desktop](https://docs.docker.com/desktop/kubernetes/) or similar to run a local cluster. The `install` command will warn if any required dependencies are missing.

User guides, developer guides, operations guides and API reference documentation is all available at:

https://mckinsey.github.io/agents-at-scale-ark/

The [Quickstart](https://mckinsey.github.io/agents-at-scale-ark/quickstart/) guide will walk you through the process of configuring a model, creating an agent and running basic queries.

To troubleshoot an installation, run `ark status`.

## Configuration

You can customize Ark service installations using a `.arkrc.yaml` file in your home directory (`~/.arkrc.yaml`) or project directory. This allows you to override service properties like enabled status, namespace, or chart location.

See [`.arkrc.template.yaml`](.arkrc.template.yaml) for a complete reference of all available configuration options.

Example `.arkrc.yaml`:

```yaml
services:
  localhost-gateway:
    enabled: true
  ark-controller:
    namespace: custom-namespace
```

This example enables the `localhost-gateway` service (disabled by default) and changes the namespace for `ark-controller`.

### Installing Agents @ Scale

To install the Agents @ Scale platform with JFrog container registry credentials:

```yaml
services:
  agents-at-scale:
    enabled: true
    installArgs:
      - --set
      - containerRegistry.enabled=true
      - --set
      - containerRegistry.username=YOUR_USERNAME
      - --set
      - containerRegistry.password=YOUR_PASSWORD
```

Replace `YOUR_USERNAME` and `YOUR_PASSWORD` with your JFrog credentials.

See [.arkrc.yaml.sample](.arkrc.yaml.sample) for a complete example with all available options.
