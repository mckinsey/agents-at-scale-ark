# ARK API Deployment Guide

## Quick Deploy to Demo Cluster

This guide covers deploying ark-api updates to the `ark-demo-cluster` EKS cluster.

### Prerequisites

- AWS CLI configured with valid credentials (`pmck` profile)
- Docker installed and running
- kubectl configured for ark-demo-cluster
- Access to ECR repository

### Build and Deploy Steps

#### 1. Build the Docker Image Locally

```bash
cd ~/projects/agents-at-scale-ark

# Build the ark-api Docker image
cd services/ark-api
docker build -t ark-api:latest -f Dockerfile .
```

#### 2. Tag and Push to ECR

```bash
# Set variables
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile pmck)
ECR_REPO="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ark-api"

# Login to ECR
aws ecr get-login-password --region $AWS_REGION --profile pmck | \
  docker login --username AWS --password-stdin $ECR_REPO

# Tag the image
docker tag ark-api:latest $ECR_REPO:latest
docker tag ark-api:latest $ECR_REPO:$(date +%Y%m%d-%H%M%S)

# Push to ECR
docker push $ECR_REPO:latest
docker push $ECR_REPO:$(date +%Y%m%d-%H%M%S)
```

#### 3. Update kubeconfig

```bash
AWS_PROFILE=pmck aws eks update-kubeconfig --name ark-demo-cluster --region us-east-1
```

#### 4. Restart the Deployment

The deployment uses `imagePullPolicy: Always` so restarting will pull the latest image:

```bash
# Find the namespace (likely kyc-demo)
kubectl get deployments -A | grep ark-api

# Restart the deployment
kubectl rollout restart deployment/ark-api -n kyc-demo

# Wait for rollout to complete
kubectl rollout status deployment/ark-api -n kyc-demo --timeout=300s
```

#### 5. Verify the Fix

```bash
# Check pods are running
kubectl get pods -n kyc-demo -l app.kubernetes.io/name=ark-api

# Test the teams endpoint
curl -s https://dashboard-demo.dev.agents-at-scale.com/api/v1/teams?namespace=kyc-onboarding-demo | jq
```

### Alternative: Using Helm

If ark-api is deployed via Helm chart:

```bash
cd ~/projects/agents-at-scale-ark/services/ark-api

# Upgrade the Helm release
helm upgrade ark-api ./chart \
  --namespace kyc-demo \
  --set app.image.repository=$ECR_REPO \
  --set app.image.tag=latest \
  --set app.imagePullPolicy=Always \
  --wait \
  --timeout=5m
```

## Recent Fix: Teams Endpoint 500 Error

**Commit**: `ec690e4a - fix: convert member dicts to TeamMember objects in team detail response`

**File Modified**: `ark-api/src/ark_api/api/v1/teams.py`

**Issue**: The teams endpoint at `/api/v1/teams?namespace=kyc-onboarding-demo` was returning 500 errors.

**Root Cause**: The `team_to_detail_response` function was passing raw member dictionaries to `TeamDetailResponse`, which expects `TeamMember` objects.

**Fix**: Convert raw member dicts to TeamMember objects before creating the response:

```python
# Convert raw member dicts to TeamMember objects
from ...models.teams import TeamMember
members_raw = spec.get("members", [])
members = [TeamMember(**member) if isinstance(member, dict) else member for member in members_raw]
```

## Troubleshooting

### AWS Credentials Expired

```bash
# Refresh AWS credentials (method depends on your setup)
# For pmck profile, you may need to re-authenticate

# Verify credentials
aws sts get-caller-identity --profile pmck
```

### Image Pull Errors

```bash
# Check ECR repository exists
aws ecr describe-repositories --region us-east-1 --profile pmck | grep ark-api

# If repository doesn't exist, create it
aws ecr create-repository --repository-name ark-api --region us-east-1 --profile pmck
```

### Pod Not Starting

```bash
# Check pod logs
kubectl logs -n kyc-demo deployment/ark-api --tail=50

# Check pod events
kubectl describe pod -n kyc-demo -l app.kubernetes.io/name=ark-api
```
