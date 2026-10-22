---
description: Shift the ARK project board forward one release after a release ships
---

Roll the ARK project board forward one release. The released version is:
**$ARGUMENTS** (if empty, let the script infer it from the latest stable tag).

`scripts/sprint-rollover.sh` does the work. Your job is to run it, read the
report, and put the judgement calls to the user. Do not hand-edit the board
with `gh project item-edit` — individual calls trip GitHub's secondary rate
limiter, which is the whole reason the script batches.

With N as the released version, the script marks Done every N card whose fix is
in the `vN` tag (those stay in N), then moves N+1 → N+2, then moves the
remaining not-Done N cards → N+1. Status is never rewritten by the moves.

## 1. Check auth before anything else

Two separate gates, and the org trips both:

- The `mckinsey` org rejects classic PATs. If `gh auth status` shows a `ghp_`
  token, ask the user to run `! gh auth login --web`.
- The OAuth token also needs the Projects scope. If scopes lack `project`, ask
  for `! gh auth refresh -s project`.

Stop until the probe succeeds. Do not try to work around either gate.

## 2. Dry run

```bash
scripts/sprint-rollover.sh $ARGUMENTS
```

Dry-run is the default; nothing is written. Read the report it prints the path
to. Before going further, confirm against the repo itself:

- The three iteration titles are the ones you expect. The script picks N+1 and
  N+2 by `startDate` order, not by arithmetic on the version, so a skipped
  sprint number is handled but worth eyeballing.
- The "Marked Done" list is consistent with
  `git log v<previous>..v<released> --format=%s | grep -oE '\(#[0-9]+\)$'`.
  A card claiming to have shipped with no PR in that range is a bug worth
  chasing, not a rounding error.

## 3. Put the judgement calls to the user

The report's **Anomalies** section is the part a human has to decide on. Surface
these rather than acting on them:

- Cards closed as completed with no PR in the tag — the work may sit in a
  follow-up PR that has not merged. They get carried forward.
- Open issues whose fix already shipped — these usually want closing, not
  moving. Closing them is the user's call.
- `Blocked` cards — they move still blocked, which may not be useful.

Also tell the user the total carried forward. If the next sprint ends up
holding more live work than the one that just closed delivered, say so — the
rollover defers the problem rather than solving it.

## 4. Apply

Only after the user has seen the dry-run summary:

```bash
scripts/sprint-rollover.sh $ARGUMENTS --apply
```

It verifies every touched card against the plan and fails loudly on a mismatch.
If it stops partway — rate limit, or a 504 on a big batch — re-run it. It
rebuilds the plan from current board state, so it finishes the remainder.

This is a **one-shot operation per release, not an idempotent one**. Once the
carry-over has landed in N+1 those cards look exactly like work planned there,
so a further run would shift them again. The script refuses once N has no
carry-over left. Never pass `--force` to get past that refusal unless the user
has explicitly said they want N+1 shifted a second time.

Flags, only when the user asks for them: `--include-done` also moves Done cards
out of N+1 (the default leaves them, so finished work keeps its sprint);
`--skip-done-pass` does the moves without touching Status.

## 5. Confirm

Re-run the dry run. It should now refuse with "Nothing to carry forward from
N" — that refusal *is* the success signal, because the carry-over has landed
and N holds only Done cards. If instead it still proposes moves out of N,
something changed underneath you; report that rather than applying again.

## Output

Report to the user, briefly:

- The three iterations and the direction of the shift.
- Counts: marked Done, moved N+1 → N+2, moved N → N+1, left alone.
- Every anomaly, with the card number and why it needs a human.
- The report path.

Do not restate the full card tables — they are in the report file.
