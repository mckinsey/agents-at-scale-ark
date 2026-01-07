---
name: Ark Dashboard and UI Testing
description: Test the Ark Dashboard and UI with Playwright and create PRs with screenshots. Use this skill when testing dashboard UI, taking screenshots for PRs, or validating dashboard changes.
---

# Ark Dashboard and UI

Test Ark Dashboard UI with Playwright and attach screenshots to PRs.

## When to use this skill

Use this skill when:
- User wants to test the Ark dashboard
- User needs screenshots for a PR
- User asks to validate dashboard UI changes

## Prerequisites

**CRITICAL**: Before proceeding, verify Kubernetes is available:

```bash
kubectl cluster-info
```

If this fails, **STOP** and inform the user:
> Cannot continue without a Kubernetes environment. Please ensure Kind or another Kubernetes cluster is running and kubectl is configured.

Ark must be deployed first. Use the **ark-setup** skill if needed.

## Setup

Port forward the dashboard and warm up:

```bash
kubectl port-forward svc/ark-dashboard 3000:3000 -n default &
curl http://localhost:3000
```

## Test with Playwright

Use Playwright MCP tools to navigate and screenshot:
- `browser_navigate` - Open pages
- `browser_wait_for` - Wait for elements
- `browser_click` - Click elements
- `browser_take_screenshot` - Capture screenshots

Screenshots save to `.playwright-mcp/screenshots/`. Move to `./screenshots/` for organization.

## Upload Screenshots for PRs

Check if user has a scratch repo:
```bash
gh repo view <USERNAME>/scratch
```

If not, suggest creating: `scratch/pull-request-attachments/<org>_<repo>/`

Upload screenshots:
```bash
cd /tmp && git clone git@github.com:<USERNAME>/scratch.git
mkdir -p scratch/pull-request-attachments/<org>_<repo>
cp ./screenshots/*.png scratch/pull-request-attachments/<org>_<repo>/
cd scratch && git add . && git commit -m "chore: screenshots for <org>/<repo> PR" && git push
```

Reference in PR body:
```markdown
![Screenshot](https://raw.githubusercontent.com/<USERNAME>/scratch/master/pull-request-attachments/<org>_<repo>/01-screenshot.png)
```

Update PR:
```bash
gh api repos/<org>/<repo>/pulls/<NUMBER> -X PATCH -f body="..."
```
