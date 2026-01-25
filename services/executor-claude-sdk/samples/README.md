# Claude SDK Executor Samples

End-to-end examples demonstrating common use cases for the Claude SDK executor.

## Prerequisites

1. **Ark installed** - See [Ark installation guide](https://mckinsey.github.io/agents-at-scale-ark/)
2. **Claude SDK Executor deployed** - Deploy the executor to your cluster
3. **Authentication configured** - Set up one of the supported providers (see [README](../README.md))
4. **GitHub token** (for git operations) - Create a token with `repo` scope

## Samples

| Sample | Description | Key Features |
|--------|-------------|--------------|
| [pr-reviewer](./pr-reviewer/) | Review pull requests and submit feedback | Git checkout, PR review workflow |
| [feature-developer](./feature-developer/) | Develop features from descriptions | Branch creation, inline critic, PR creation |
| [code-refactor](./code-refactor/) | Refactor code with test validation | Test execution, conditional PR creation |

## Quick Start

```bash
# 1. Create a namespace for testing
kubectl create namespace claude-samples

# 2. Create required secrets
kubectl create secret generic github-creds \
  --namespace claude-samples \
  --from-literal=token=$GITHUB_TOKEN

kubectl create secret generic git-ssh \
  --namespace claude-samples \
  --from-file=ssh-privatekey=$HOME/.ssh/id_ed25519

# 3. Apply a sample
kubectl apply -f samples/feature-developer/ -n claude-samples

# 4. Create a query to test
kubectl apply -f samples/feature-developer/query.yaml -n claude-samples

# 5. Watch the query status
kubectl get queries -n claude-samples -w
```

## Sample Structure

Each sample includes:

```
sample-name/
├── agent.yaml              # Agent CRD definition
├── execution-profile.yaml  # ExecutionProfile with hooks and SDK config
├── query.yaml              # Example query to test the agent
└── README.md               # Sample-specific documentation
```

## Customizing Samples

### Change the Repository

Edit the `query.yaml` parameters:

```yaml
parameters:
  - name: repo_url
    value: "https://github.com/YOUR-ORG/YOUR-REPO.git"
```

### Change the Model

Edit the `agent.yaml` model reference:

```yaml
spec:
  modelRef:
    name: your-model  # Must match a Model CRD in your cluster
```

### Adjust Tool Permissions

Edit the `execution-profile.yaml` SDK config:

```yaml
sdkConfig:
  claude:
    allowedTools:
      - Read
      - Edit
      - Write
      - Bash  # Remove for read-only operations
```

## Authentication Setup

### For Anthropic Direct

```bash
kubectl create secret generic anthropic-api-key \
  --namespace claude-samples \
  --from-literal=api-key=$ANTHROPIC_API_KEY
```

### For AWS Bedrock

Use IRSA (IAM Roles for Service Accounts):

```yaml
# In your executor Helm values
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/claude-executor-role
```

### For Azure AI Foundry

Use Workload Identity with your tenant's service account.

## Troubleshooting

### Query stuck in "Running"

Check executor logs:
```bash
kubectl logs -l app=executor-claude-sdk -n ark-system -f
```

### Git clone fails

Verify SSH key is correctly mounted:
```bash
kubectl exec -it deploy/executor-claude-sdk -n ark-system -- cat /root/.ssh/id_rsa
```

### PR creation fails

Check GitHub token has `repo` scope and is correctly mounted.
