---
name: sprint-rollover
description: Shift the ARK project board forward one release after a release ships - mark the shipped cards Done and carry the unfinished ones into the next sprint. Use when the user asks to "roll over the sprint", "move tickets to the next release", "shift the board", mentions that a release went out early and the sprint needs re-pointing, or names a released version and asks what should move. For reading the board without changing it, use the "slack-announcement" skill instead.
---

# Sprint Rollover

Ark releases sometimes land ahead of the sprint boundary. When that happens the
Sprint-iteration ladder on the ARK project board (org `mckinsey`, project 10)
has to shift by one release, and cards whose work actually shipped have to be
marked Done so the closed sprint reads accurately.

With `N` as the release that just shipped, the rollover is:

1. Mark Done every `N` card whose closing PR is an ancestor of the `vN` tag.
   Those stay in `N`.
2. Move `N+1` → `N+2`.
3. Move the remaining not-Done `N` cards → `N+1`.

Steps 2 and 3 must run in that order. Doing 3 first means the cards landing in
`N+1` get swept straight on to `N+2`. Status is never rewritten by the moves.

`scripts/sprint-rollover.sh` in this skill does the work. Run it; do not
hand-edit the board with `gh project item-edit`. Individual calls get throttled
by GitHub's secondary rate limiter for tens of minutes, which is the whole
reason the script batches.

## 1. Check auth before anything else

Two separate gates, and the `mckinsey` org trips both.

```bash
gh auth status
gh api graphql -f query='query { organization(login:"mckinsey"){ projectV2(number:10){ title } } }'
```

**If the token starts with `ghp_`** — a classic PAT — the org rejects it
outright. Ask the user to run `! gh auth login --web`.

**If the probe returns `INSUFFICIENT_SCOPES`** the OAuth token lacks the
Projects scope. Ask for `! gh auth refresh -s project`. `read:project` alone
lets the dry run work but every move fails, so ask for `project`.

Stop until the probe prints the project title. Do not try to work around either
gate. The script's preflight detects both and prints the same instruction.

## 2. Dry run

```bash
bash .claude/skills/sprint-rollover/scripts/sprint-rollover.sh <version>
```

Dry-run is the default; nothing is written. The run takes ~90s, most of it
paginating ~31 pages of board items.

Before going further, confirm against the repo itself:

- The three iteration titles are the ones you expect. `N+1` and `N+2` come from
  `startDate` order, not arithmetic on the version, so a skipped sprint number
  is handled — but eyeball it.
- The "Marked Done" list is consistent with the PRs in the release:

  ```bash
  git log v<previous>..v<released> --format=%s | grep -oE '\(#[0-9]+\)$'
  ```

  A card credited to a PR outside that range is shipped work from an *earlier*
  release whose card was never closed. That is legitimate, but the report's
  "Shipped in" column should say which release, and it is worth mentioning.

## 3. Put the judgement calls to the user

The report's **anomalies** are for a human to decide, not for you to act on:

- Cards closed as completed with no closing PR in the tag — the work may sit in
  a follow-up PR that has not merged. They get carried forward.
- Open issues whose fix already shipped — these usually want closing, not
  moving. Closing them is the user's call.
- `Blocked` cards — they move still blocked, which may not be useful.

Also report the total carried forward. If `N+1` ends up holding more live work
than `N` actually delivered, say so: the rollover is deferring the problem
rather than solving it.

## 4. Apply

Only after the user has seen the dry-run table.

```bash
bash .claude/skills/sprint-rollover/scripts/sprint-rollover.sh <version> --apply
```

This prints a per-card table of every change and prompts for approval. When you
have already taken the user's approval in conversation, add `--yes` to skip the
prompt — never pass `--yes` without having asked.

Every touched card is re-queried and verified against the plan afterwards, and a
mismatch fails loudly.

**If it stops partway** — a rate limit, or a 504 on a large batch — re-run it.
It rebuilds the plan from current board state and finishes the remainder. A 504
can apply a batch *partially*, so check actual board state rather than assuming
the whole batch failed.

Other flags, only when the user asks: `--include-done` also moves Done cards out
of `N+1` (the default leaves them, so finished work keeps its sprint);
`--skip-done-pass` does the moves without touching Status.

## 5. Confirm

Re-run the dry run. It should refuse with *"Nothing to carry forward from N"* —
that refusal **is** the success signal, because the carry-over has landed and
`N` holds only Done cards. If it still proposes moves out of `N`, something
changed underneath you; report that rather than applying again.

## This is one-shot per release, not idempotent

Once carry-over lands in `N+1` those cards are indistinguishable from work
planned there, so a second run shifts them again. The script refuses when `N`
has no carry-over left. **Never pass `--force` to get past that refusal** unless
the user has explicitly said they want `N+1` shifted a second time.

## Constraints that were each a bug first

Do not "simplify" these away:

- **Batch every mutation into one request** via aliased
  `updateProjectV2ItemFieldValue` calls. Individual calls get throttled.
- **`gh api rate_limit` is advisory only.** It reported `4289/5000 remaining`
  while every write was being rejected by the unpublished secondary limiter.
- **Classify errors from the GraphQL error channel, never the response body.**
  Matching the body for "rate limit" misfires on issue titles containing that
  phrase (#3226, #3229) and retries forever.
- **Only closing PRs count as shipped evidence, and the issue must itself be
  closed.** Counting bare cross-references plus a release-cumulative
  `git tag --contains` once marked 5 open issues Done citing PRs from v0.1.68.
  Merged PR cards report state `MERGED`, not `CLOSED`.
- **Validate the scan against `totalCount`.** The board holds ~3,000 items and
  GitHub truncates deep Projects pagination under load: a page comes back with
  zero nodes and `hasNextPage: false`, which looks exactly like a clean finish.
  A scan that stopped at 1,800 of 3,073 reported half the sprint as empty. The
  script retries the empty page and refuses to proceed on a short scan, so a
  truncated read can never drive a partial rollover. `totalCount` itself
  intermittently returns 0, so take the max across pages rather than trusting
  one reading.

## Output

Report briefly:

- The three iterations and the direction of the shift.
- Counts: marked Done, moved `N+1` → `N+2`, moved `N` → `N+1`, left alone.
- Every anomaly, with its card number and why it needs a human.
- The report path.

Do not restate the full card tables — they are in the report file.
