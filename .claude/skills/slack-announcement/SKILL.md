---
name: slack-announcement
description: Produce a themed Slack post announcing Ark releases. Pulls from BOTH the Ark core repo (mckinsey/agents-at-scale-ark) and the Marketplace repo (mckinsey/agents-at-scale-marketplace), validates docs links, groups features by theme with relevant emoji, and ends with a "Coming next" section sourced from the current sprint on the ARK project board. Invoke when the user asks for a "release announcement", "slack post", "what's new since vX", "changelog for #channel", or similar.
---

# Slack announcement skill

## Goal
A single Slack-ready post that summarises user-visible changes across Ark core and the Marketplace for a given window, grouped by theme, with markdown-style docs links, and a forward-looking section.

## Inputs to confirm with the user
- **Window** — explicit versions (e.g. `v0.1.55 → v0.1.60`) or a date range. If unclear, ask.
- **Depth** — full long-form post, a short #announcements variant, or both (thread reply). Default full.

## Process

### 1. Pull releases from BOTH repos
Always check both. A release in one repo often has no matching entry in the other.

```sh
# Ark core
gh release list --repo mckinsey/agents-at-scale-ark --limit 60
gh release view <tag> --repo mckinsey/agents-at-scale-ark --json body

# Marketplace (component-level tags, e.g. executor-claude-agent-sdk-v0.1.8)
gh release list --repo mckinsey/agents-at-scale-marketplace --limit 100 \
  --json tagName,publishedAt \
  --jq '.[] | select(.publishedAt >= "<start-date>")'
gh release view <tag> --repo mckinsey/agents-at-scale-marketplace --json body
```

For the marketplace, group component-level releases by component (e.g. `executor-claude-agent-sdk: v0.1.0 → v0.1.9`) and summarise the arc, not each patch.

### 2. Deduplicate and filter
- **Release-please regenerates the full CHANGELOG** in some releases — compare `gh api repos/<owner>/<repo>/compare/<prev>...<current>` to find the genuinely new commits, not cumulative ones.
- **Drop ops/CI-only items**: test migrations, dependency bumps, CVE patches (unless user-visible), flaky-CI fixes, release-please plumbing, deploy-pipeline fixes, SonarQube tweaks, mock-LLM work, install reliability patches.

### 3. Fetch docs links from the PR that shipped each feature

Release notes carry a PR number (`... ([#1215](...))`). The PR's own diff is the best source of truth for which docs page documents that feature. Don't guess the URL from the feature name — pull it from the PR.

#### 3a. Find docs files changed in each PR

```sh
gh pr view <pr-number> --repo <owner>/<repo> --json files \
  --jq '.files[].path' | grep -E '^docs/content/.*\.mdx?$|/README\.md$'
```

Typical outputs:

- `docs/content/user-guide/teams/index.mdx`
- `docs/content/developer-guide/observability.mdx`
- `docs/content/reference/query-execution.mdx`
- `executors/claude-agent-sdk/README.md` (marketplace — component-level docs are served from component READMEs)

#### 3b. Map file paths to published URLs

Both docs sites mount `docs/content/` at the site root. The mapping:

1. Strip the `docs/content/` prefix.
2. Strip the `.mdx` / `.md` suffix.
3. Strip a trailing `/index` (index files map to the parent path).
4. Prepend the docs-site base URL.
5. Append a trailing `/`.

| Changed file | Published URL |
|---|---|
| `docs/content/user-guide/teams/index.mdx` | `https://mckinsey.github.io/agents-at-scale-ark/user-guide/teams/` |
| `docs/content/developer-guide/observability.mdx` | `https://mckinsey.github.io/agents-at-scale-ark/developer-guide/observability/` |
| `docs/content/reference/query-execution.mdx` | `https://mckinsey.github.io/agents-at-scale-ark/reference/query-execution/` |

For the **marketplace**, component READMEs are surfaced under their component namespace:

| Changed file | Published URL |
|---|---|
| `executors/claude-agent-sdk/README.md` | `https://mckinsey.github.io/agents-at-scale-marketplace/executors/claude-agent-sdk/` |
| `mcps/filesystem-mcp-server/README.md` | `https://mckinsey.github.io/agents-at-scale-marketplace/mcps/filesystem-mcp-server/` |
| `services/phoenix/README.md` | `https://mckinsey.github.io/agents-at-scale-marketplace/services/phoenix/` |

If a PR touches multiple docs pages, pick the one most specific to the bullet's user benefit. If a PR touches no docs files, skip to the fallback in 3d.

#### 3c. Validate every candidate URL — source file is the primary signal

The docs sites are a Next.js SPA on GitHub Pages. The published URL works once a browser runs the JS bundle, which is what real readers get when they click a Slack link. A direct `curl` fetches the SPA shell and often sees "404: This page could not be found" in the body even when the page is perfectly fine. **Don't treat curl-404 as "broken"** — it only predicts unfurl preview quality, not link validity.

**Primary validation (authoritative):** confirm the source MDX file still exists on `main`:

```sh
# Example — verify docs/content/executors/claude-agent-sdk.mdx exists
gh api repos/mckinsey/agents-at-scale-marketplace/contents/docs/content/executors/claude-agent-sdk.mdx \
  --jq '.name' 2>/dev/null && echo EXISTS || echo MISSING
```

If the file exists, the URL is valid — include it.

**Secondary check (informational):** run `curl` as a preview-quality hint. If it says BROKEN, the link still works when clicked but Slack's unfurl preview may not render. That's acceptable — don't drop the link for it.

```sh
curl -sL "<url>" | grep -qi "404: This page could not be found" \
  && echo "unfurl-preview-broken (still include)" \
  || echo "unfurl-preview-ok"
```

Use `WebFetch` if you want a third opinion on whether the rendered page actually matches the feature (e.g. to pick between two candidate pages touched by the same PR).

#### 3d. Fallback order
1. PR changed a docs source file, file still exists on `main` → use the mapped URL.
2. PR touched no docs, but there's an obvious existing page (e.g. `user-guide/teams.mdx` for a team-strategy change) → verify the source file exists, then use it.
3. No source file exists for the feature → **omit the link on that bullet**; still write the bullet.
4. The two docs roots always go in the post header regardless:
   - `https://mckinsey.github.io/agents-at-scale-ark/`
   - `https://mckinsey.github.io/agents-at-scale-marketplace/`

#### 3e. Essential deep links (always include)
Even if their source is ambiguous, these are too important to skip:
- `https://mckinsey.github.io/agents-at-scale-ark/reference/upgrading/` — the upgrade guide, referenced from the Upgrade notes section.

#### 3f. Link blocklist
Never link these pages, even if a PR touched their source file. They're either too generic to add value or actively discouraged:
- `https://mckinsey.github.io/agents-at-scale-ark/user-guide/dashboard/` — pick the feature-specific page instead, or drop the link.

### 4. Group by theme (fixed order)
Use these buckets in this order. Drop any bucket with no content.

1. **Protocol & core runtime** — A2A, query engine, controller contracts
2. **Marketplace platform & Dashboard** — marketplace UI, dashboard integrations, install flow
3. **New marketplace components** — newly published executors, MCPs, inspectors, observability backends
4. **New demos and bundles** — demo packages, sample bundles
5. **Teams & agents** — team strategies, selector improvements, agent capabilities
6. **Models & SDK** — provider support, SDK features, auth
7. **Sessions, chat, streaming** — broker, session UX, streaming
8. **CLI & dev experience** — ark-cli, devspace, docs onboarding

### 5. Write each bullet — and hoist shared links up to the section heading

Pattern: `• :emoji: *Feature name* — one-line benefit in plain prose. [docs](<url>)`

- Emoji: relevant Slack shortcode (`:feather:`, `:rocket:`, `:broom:`…). One per bullet.
- Feature name: bold with `*` (Slack single-asterisk bold).
- Benefit: translate the change into something a user would care about. Don't restate the commit message.
- Link: markdown format `[docs](url)` — the user explicitly prefers this over Slack's `<url|text>`.

**Shared-link hoisting.** If two or more bullets in the same section would point at the same docs page, don't repeat the link — attach it to the section heading instead and leave those bullets link-free. Only bullets that point to a *different* page keep their own per-bullet link.

Heading-with-link format:
```
*:brain: Models & SDK* — [docs](https://mckinsey.github.io/agents-at-scale-ark/user-guide/models/)
• :bulb: *Native Anthropic provider* — use Claude directly without an OpenAI-compat shim, full tool-calling supported.
• :satellite_antenna: *OpenTelemetry tracing* — ... [docs](https://mckinsey.github.io/agents-at-scale-ark/developer-guide/observability/)   ← different page, keep per-bullet
```

Rule of thumb:
- All bullets share one link → put it on the heading, strip from bullets.
- Most bullets share a link, one or two are different → heading gets the majority link, per-bullet links only on the outliers.
- Every bullet has a distinct link → no heading link, each bullet carries its own.
- No bullet has a link → heading is plain, no `— [docs](...)` suffix.

Plain-bullet example (no link on either heading or bullet):

```
• :bulb: *Native Anthropic provider* — use Claude directly without an OpenAI-compat shim, full tool-calling supported.
```

### 6. Header
```
:rocket: *Ark releases — what's new*

<window, e.g. "Feb 27 → Apr 21"> across Ark core and the Marketplace
Docs: [Ark](https://mckinsey.github.io/agents-at-scale-ark/) · [Marketplace](https://mckinsey.github.io/agents-at-scale-marketplace/)
```

### 7. Upgrade notes and breaking changes

Every announcement ends with an "Upgrade notes" section before "Coming next". It links the upgrade guide and surfaces anything that could break an existing user in this window.

#### 7a. Always link the upgrade guide
In the header of this section:
`Upgrade guide: [docs](https://mckinsey.github.io/agents-at-scale-ark/reference/upgrading/)`

This link is on the allowlist from step 3e — include it even though it fails curl.

#### 7b. Find what actually changed
The upgrade guide (`docs/content/reference/upgrading.mdx` in the Ark repo) is the authoritative list. Any user-impacting change is written there. Pull its commit history in the window:

```sh
gh api "repos/mckinsey/agents-at-scale-ark/commits?path=docs/content/reference/upgrading.mdx&since=<ISO-start>&until=<ISO-end>" \
  --jq '.[] | "\(.sha[0:7]) \(.commit.author.date | split("T")[0]) #\(.commit.message | split("\n")[0])"'
```

For each commit it finds, read the diff to see what was added to the guide:

```sh
gh api "repos/mckinsey/agents-at-scale-ark/commits/<sha>" \
  --jq '.files[] | select(.filename == "docs/content/reference/upgrading.mdx") | .patch'
```

Write one bullet per added guide entry. Each bullet names the change and the user action in one line.

#### 7c. Backup signal — conventional-commit breaking markers
If `upgrading.mdx` wasn't edited but you suspect something broke, scan commits in the window for:
- Title contains `!:` (e.g. `feat(ark)!:`, `refactor!:`) — explicit conventional-commits break marker.
- Commit body contains `BREAKING CHANGE:` — conventional-commits footer.
- Title starts with `feat(...): deprecate ` or `refactor: remove ` — deprecations/removals worth calling out.

```sh
gh api repos/mckinsey/agents-at-scale-ark/compare/<prev-tag>...<current-tag> \
  --jq '.commits[] | select((.commit.message | test("^[a-z]+(\\(.+\\))?!:")) or (.commit.message | contains("BREAKING CHANGE:"))) | "\(.sha[0:7]) \(.commit.message | split("\n")[0])"'
```

Include these even when the upgrade guide hasn't been updated — they probably should have been, and readers still need the warning.

#### 7d. If there are no breaking changes
Still include the section, with just the upgrade guide link and a one-line reassurance:
`:white_check_mark: No breaking changes this window. Full upgrade notes: [docs](...).`

#### 7e. Section format in the post
```
:warning: *Upgrade notes*
Upgrade guide: [docs](https://mckinsey.github.io/agents-at-scale-ark/reference/upgrading/)

• :no_entry_sign: *<what breaks>* — <what the user has to do>.
• :wastebasket: *<what's deprecated>* — <what replaces it, when it's removed>.
```

Use `:no_entry_sign:` for hard breaks, `:wastebasket:` for deprecations, `:arrows_counterclockwise:` for migrations that happen automatically (mutating webhook etc. — still worth calling out).

### 8. "Coming next" section
Source: the currently-active iteration on the ARK GitHub Project (org `mckinsey`, project number `10`, iteration field `Sprint`).

Find the current iteration:

```sh
gh api graphql -f query='
query {
  organization(login: "mckinsey") {
    projectV2(number: 10) {
      field(name: "Sprint") {
        ... on ProjectV2IterationField {
          configuration { iterations { title startDate duration } }
        }
      }
    }
  }
}' --jq '.data.organization.projectV2.field.configuration.iterations[0]'
```

List items in that sprint with their status:

```sh
gh api graphql -f query='
query {
  organization(login: "mckinsey") {
    projectV2(number: 10) {
      items(first: 100) {
        nodes {
          content { ... on Issue { number title } ... on PullRequest { number title } }
          sprint: fieldValueByName(name: "Sprint") { ... on ProjectV2ItemFieldIterationValue { title } }
          status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        }
      }
    }
  }
}' --jq '.data.organization.projectV2.items.nodes[] | select(.sprint.title == "<current-sprint-title>") | "\(.status.name) | #\(.content.number) \(.content.title)"'
```

- Include items with status `In Progress` or `In review`.
- Apply the same ops-filter from step 2.
- Each bullet: `• :emoji: *Feature name* — one-line benefit.` — no docs links (these haven't shipped yet).

### 9. Deliver
1. Show the full post to the user.
2. Offer to copy to clipboard: `pbcopy` on macOS, `xclip -selection clipboard` on Linux, `clip.exe` on WSL.
3. If the user asks for a shorter variant, produce headline + 5–8 bullets + "Upgrade notes" + "Coming next".

## Do NOT
- Do not include GitHub issue/PR links in bullets — docs only.
- Do not include ops/CI/test-infra items.
- Do not use Slack `<url|text>` format; use markdown `[text](url)`.
- Do not write changelog-style bullets (`* feat(foo): bar`). Translate every change into a user benefit.
- Do not fabricate docs pages — validate every link before including it.

## Pre-delivery sanity check
- [ ] Every bullet's docs link was derived from its shipping PR's docs-file changes (step 3a–3b), not guessed.
- [ ] Every linked source MDX file still exists on `main` (step 3c primary check).
- [ ] Curl preview check is run; BROKEN is logged but does not cause the link to be dropped.
- [ ] Shared links are hoisted to the section heading; per-bullet links only appear when they differ from the heading link.
- [ ] No link in the post points at any URL in the step 3f blocklist.
- [ ] Themes in the defined order; empty themes dropped.
- [ ] Header shows the correct window.
- [ ] *Upgrade notes* section is present, links the upgrade guide, and surfaces every entry added to `upgrading.mdx` in the window (plus any `!:` / `BREAKING CHANGE:` commits not yet documented there).
- [ ] "Coming next" matches the currently-active sprint (verify `startDate` + `duration` vs today).
- [ ] No GitHub issue/PR links in bullets.
- [ ] No ops items (tests, deploys, CVEs, CI, release-please plumbing).
