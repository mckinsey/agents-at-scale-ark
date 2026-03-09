#!/bin/bash
set -e

# Ralph Wiggum Loop for Ark evaluations cleanup
#
# "Pure" Ralph is just a declarative prompt in a while loop — the codebase
# state is the only source of truth. The progress file below is a practical
# addition for larger tasks so Claude can track what it's done between sessions.

MAX_ITERATIONS=${1:-50}
ITERATIONS=0

# Seed progress file if it doesn't exist
[ -f progress.md ] || cat > progress.md << 'SEED'
# Evaluations Cleanup Progress

## Completed

## Remaining
- [ ] Identify all evaluation-related files, CRDs, docs, demos
- [ ] Remove evaluation CRDs and related code
- [ ] Remove evaluation integration tests
- [ ] Remove evaluation documentation
- [ ] Remove evaluation references across codebase
- [ ] Search for anything else we need to do, add it to this list here
- [ ] Verify all integration tests pass
- [ ] Create evidence (screenshots, recordings, test results)
SEED

PROMPT='Read progress.md. Pick the next incomplete task. Do that ONE task only.
When done, update progress.md — check off what you completed, add detail
on what you did. Commit your changes.

Context: "Evaluations" are no longer core in Ark. We are moving them to a
marketplace. Remove the CRDs, docs, demos, integration tests, references.

The final task should always be: verify everything works and create evidence
in ./evidence — use shellwright MCP for terminal recordings, Playwright MCP
for dashboard screenshots, test output, metrics.

Do one task, update progress.md, commit, then stop.'

while [ $ITERATIONS -lt $MAX_ITERATIONS ]; do
  ITERATIONS=$((ITERATIONS + 1))

  # YOLO.
  echo "$PROMPT" | claude -p --dangerously-skip-permissions --verbose --output-format stream-json

  # Commit whatever this iteration did
  git add -A && git commit -m "ralph: iteration $ITERATIONS" --allow-empty

  # Stop if all tasks are done
  grep -q "\[ \]" progress.md || break

  sleep 2
done
