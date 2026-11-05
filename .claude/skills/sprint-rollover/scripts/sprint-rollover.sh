#!/usr/bin/env bash
# Shift the ARK project board forward one release after a release ships.
#
# Run this when a release is cut ahead of its sprint boundary. With N as the
# release that just shipped, it:
#   1. marks Done every N card whose fix is provably in the vN tag (those stay
#      in sprint N)
#   2. moves sprint N+1 -> N+2
#   3. moves the remaining not-Done N cards -> N+1
# Steps 2 and 3 run in that order; reversing them would sweep the cards landing
# in N+1 straight on to N+2. Status is never written during the moves.
#
# Usage: bash .claude/skills/sprint-rollover/scripts/sprint-rollover.sh <version> [options]
# Example: bash .claude/skills/sprint-rollover/scripts/sprint-rollover.sh 0.1.72 --apply
#
# Dry-run unless --apply is given. Needs an OAuth or fine-grained token with
# the project scope: the mckinsey org rejects classic PATs, so run
# `gh auth login --web` then `gh auth refresh -s project` first.
#
# This is a ONE-SHOT operation per release, not an idempotent one. Once the
# carry-over has landed in N+1 those cards are indistinguishable from work
# planned there, so a second run would shift them again. The script refuses
# to run when N has no carry-over left; --force overrides.
set -euo pipefail

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
white='\033[1;37m'
blue='\033[0;34m'
nc='\033[0m'

ORG="mckinsey"
PROJECT_NUMBER=10
SPRINT_FIELD="Sprint"
STATUS_FIELD="Status"
DONE_OPTION="Done"
BATCH_SIZE=20
LOOKUP_BATCH=20
MAX_WAIT=3600

VERSION=""
APPLY=false
ASSUME_YES=false
FORCE=false
INCLUDE_DONE=false
SKIP_DONE_PASS=false
REPORT=""

usage() {
  cat <<EOF
Shift the ARK project board forward one release after a release ships.

Usage:
  bash .claude/skills/sprint-rollover/scripts/sprint-rollover.sh <version> [options]

Arguments:
  <released-version>    Release that just shipped, e.g. 0.1.72. Must match a
                        Sprint iteration title and a v<version> git tag.
                        Defaults to the latest stable vX.Y.Z tag.

Options:
  --apply               Perform the mutations. Without this the script only
                        reports what it would do.
  -y, --yes             Skip the interactive approval prompt. Only meaningful
                        with --apply; intended for non-interactive runs.
  --force               Run even when N has no carry-over left, i.e. when the
                        rollover looks like it already happened. Without this
                        the script refuses, because shifting N+1 with nothing
                        to make room for double-shifts the board.
  --include-done        Also move cards already marked Done out of N+1.
                        Default leaves them so finished work keeps its sprint.
  --skip-done-pass      Only do the sprint moves; never write Status.
  --report <path>       Report destination.
                        Default: out/sprint-rollover/<version>/report.md
  --project <number>    Project number. Default: ${PROJECT_NUMBER}.
  --org <login>         Organization login. Default: ${ORG}.
  --max-wait <seconds>  Total budget for rate-limit backoff. Default: ${MAX_WAIT}.
  -h, --help            Show this help.

Examples:
  bash .claude/skills/sprint-rollover/scripts/sprint-rollover.sh 0.1.72
  bash .claude/skills/sprint-rollover/scripts/sprint-rollover.sh 0.1.72 --apply
  bash .claude/skills/sprint-rollover/scripts/sprint-rollover.sh --apply --yes
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    --yes|-y) ASSUME_YES=true; shift ;;
    --force) FORCE=true; shift ;;
    --include-done) INCLUDE_DONE=true; shift ;;
    --skip-done-pass) SKIP_DONE_PASS=true; shift ;;
    --report) REPORT="${2:?error: --report needs a path}"; shift 2 ;;
    --project) PROJECT_NUMBER="${2:?error: --project needs a number}"; shift 2 ;;
    --org) ORG="${2:?error: --org needs a login}"; shift 2 ;;
    --max-wait) MAX_WAIT="${2:?error: --max-wait needs seconds}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo -e "${red}error${nc}: unknown option $1"; usage; exit 1 ;;
    *)
      if [ -n "$VERSION" ]; then
        echo -e "${red}error${nc}: unexpected argument $1"; usage; exit 1
      fi
      VERSION="$1"; shift ;;
  esac
done

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
fi
[ -f "$REPO_ROOT/version.txt" ] ||
  { echo -e "${red}error${nc}: could not locate the repo root from $0"; exit 1; }
cd "$REPO_ROOT"

for bin in gh git python3; do
  command -v "$bin" >/dev/null 2>&1 || { echo -e "${red}error${nc}: $bin not found on PATH"; exit 1; }
done

if [ -z "$VERSION" ]; then
  VERSION="$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' | grep -vE -- '-(rc|alpha|beta)' | sort -V | tail -1 | sed 's/^v//')"
  [ -n "$VERSION" ] || { echo -e "${red}error${nc}: could not infer a released version; pass one explicitly"; exit 1; }
  echo -e "${yellow}note${nc}: no version given, using latest stable tag ${white}${VERSION}${nc}"
fi
VERSION="${VERSION#v}"
TAG="v${VERSION}"

WORK="out/sprint-rollover/${VERSION}"
mkdir -p "$WORK"
[ -n "$REPORT" ] || REPORT="${WORK}/report.md"

fail() { echo -e "${red}error${nc}: $*" >&2; exit 1; }
step() { echo -e "\n${blue}==>${nc} ${white}$*${nc}"; }

WAITED=0

classify_response() {
  python3 - "$1" "$2" "$3" <<'PY'
import json, sys
out_f, err_f, rc = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    err = open(err_f).read()
except Exception:
    err = ""
try:
    d = json.load(open(out_f))
except Exception:
    d = None
msgs = [err]
if isinstance(d, dict):
    for e in (d.get("errors") or []):
        msgs.append(str(e.get("message", "")))
        msgs.append(str(e.get("type", "")))
    if d.get("message"):
        msgs.append(str(d["message"]))
blob = "\n".join(msgs).lower()
data = d.get("data") if isinstance(d, dict) else None
usable = isinstance(data, dict) and any(v is not None for v in data.values())
if "personal access token (classic)" in blob:
    print("CLASSIC_PAT")
elif "insufficient_scopes" in blob or "required scopes" in blob:
    print("SCOPES")
elif any(k in blob for k in ("rate limit", "secondary rate", "abuse detection",
                             "submitted too quickly", "exceeded a secondary")):
    print("RATELIMIT")
elif any(k in blob for k in ("http 500", "http 502", "http 503", "http 504",
                             "bad gateway", "gateway time", "timed out", "timeout",
                             "unicorn", "<!doctype html")):
    print("TRANSIENT")
elif usable:
    print("OK")
elif rc != 0 or (isinstance(d, dict) and d.get("errors")):
    print("ERROR")
else:
    print("OK")
PY
}

gql() {
  local qfile="$1" outfile="$2" attempt=0 delay=15 rc verdict
  while :; do
    attempt=$((attempt + 1))
    set +e
    gh api graphql -F query=@"$qfile" >"$outfile" 2>"${WORK}/.gql.err" </dev/null
    rc=$?
    set -e
    verdict="$(classify_response "$outfile" "${WORK}/.gql.err" "$rc")"
    case "$verdict" in
      OK)
        return 0 ;;
      CLASSIC_PAT)
        echo >&2
        echo -e "${red}error${nc}: the ${ORG} org rejects classic personal access tokens." >&2
        echo "  Re-authenticate with an OAuth token and run this again:" >&2
        echo >&2
        echo -e "      ${white}gh auth login --web${nc}" >&2
        echo >&2
        exit 1 ;;
      SCOPES)
        echo >&2
        echo -e "${red}error${nc}: your token lacks the Projects scope." >&2
        echo "  Reading the board needs read:project; moving cards needs project." >&2
        echo "  Add it to your existing login and run this again:" >&2
        echo >&2
        echo -e "      ${white}gh auth refresh -s project${nc}" >&2
        echo >&2
        exit 1 ;;
      TRANSIENT)
        if [ "$WAITED" -ge "$MAX_WAIT" ]; then
          fail "transient GitHub errors for ${WAITED}s, exceeding --max-wait ${MAX_WAIT}s. Applied work is kept; re-run to finish the remainder."
        fi
        echo -e "   ${yellow}transient GitHub error${nc} (attempt ${attempt}); retrying in ${delay}s" >&2
        sleep "$delay"
        WAITED=$((WAITED + delay))
        [ "$delay" -lt 60 ] && delay=$((delay * 2))
        continue ;;
      RATELIMIT)
        if [ "$WAITED" -ge "$MAX_WAIT" ]; then
          fail "rate limited for ${WAITED}s, exceeding --max-wait ${MAX_WAIT}s. Applied work is kept; re-run to finish the remainder."
        fi
        echo -e "   ${yellow}rate limited${nc} (attempt ${attempt}); waiting ${delay}s" >&2
        sleep "$delay"
        WAITED=$((WAITED + delay))
        [ "$delay" -lt 120 ] && delay=$((delay * 2))
        continue ;;
      *)
        cat "${WORK}/.gql.err" >&2 2>/dev/null || true
        head -c 2000 "$outfile" >&2 2>/dev/null || true
        fail "GraphQL call failed (attempt ${attempt}) using ${qfile}" ;;
    esac
  done
}

report_rate_limits() {
  gh api rate_limit --jq '.resources.graphql | "graphql primary: remaining=\(.remaining)/\(.limit) reset=\(.reset|todate)"' 2>/dev/null || true
  echo "   (the primary number can read healthy while writes are blocked by the"
  echo "    unpublished secondary limiter; treat it as advisory only)"
}

step "Preflight"

cat >"${WORK}/q-meta.graphql" <<EOF
query {
  organization(login: "${ORG}") {
    projectV2(number: ${PROJECT_NUMBER}) {
      id
      title
      sprint: field(name: "${SPRINT_FIELD}") {
        ... on ProjectV2IterationField {
          id
          configuration {
            iterations { id title startDate duration }
            completedIterations { id title startDate duration }
          }
        }
      }
      status: field(name: "${STATUS_FIELD}") {
        ... on ProjectV2SingleSelectField { id options { id name } }
      }
    }
  }
}
EOF

gql "${WORK}/q-meta.graphql" "${WORK}/meta.json"

python3 - "${WORK}/meta.json" "$VERSION" "$DONE_OPTION" "${WORK}/ctx.env" <<'PY'
import json, shlex, sys
meta, version, done_name, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
d = json.load(open(meta))
if d.get("errors"):
    print("error: " + "; ".join(e.get("message", "?") for e in d["errors"]), file=sys.stderr)
    sys.exit(1)
p = (d.get("data") or {}).get("organization", {}).get("projectV2")
if not p:
    print("error: project not found or not visible to this token", file=sys.stderr)
    sys.exit(1)
sprint, status = p.get("sprint") or {}, p.get("status") or {}
cfg = sprint.get("configuration") or {}
iters = list(cfg.get("iterations") or []) + list(cfg.get("completedIterations") or [])
if not iters:
    print("error: Sprint field has no iterations", file=sys.stderr)
    sys.exit(1)
iters.sort(key=lambda i: (i["startDate"], i["title"]))
idx = next((n for n, i in enumerate(iters) if i["title"] == version), None)
if idx is None:
    print(f"error: no Sprint iteration titled {version}", file=sys.stderr)
    print("  available: " + ", ".join(i["title"] for i in iters[-8:]), file=sys.stderr)
    sys.exit(1)
if idx + 2 >= len(iters):
    have = ", ".join(i["title"] for i in iters[idx:])
    print(f"error: need two iterations after {version}; the board only has: {have}", file=sys.stderr)
    print("  Projects V2 has no API for creating iterations - add the next sprint on the board first.", file=sys.stderr)
    sys.exit(1)
n, n1, n2 = iters[idx], iters[idx + 1], iters[idx + 2]
done = next((o for o in (status.get("options") or []) if o["name"] == done_name), None)
if not done:
    print(f"error: Status field has no {done_name!r} option", file=sys.stderr)
    sys.exit(1)
with open(out, "w") as f:
    f.write(f'PROJECT_ID={p["id"]}\n')
    f.write(f'PROJECT_TITLE={shlex.quote(p.get("title") or "")}\n')
    f.write(f'SPRINT_FIELD_ID={sprint["id"]}\n')
    f.write(f'STATUS_FIELD_ID={status["id"]}\n')
    f.write(f'DONE_OPTION_ID={done["id"]}\n')
    for key, it in (("N", n), ("N1", n1), ("N2", n2)):
        f.write(f'{key}_TITLE={it["title"]}\n')
        f.write(f'{key}_ID={it["id"]}\n')
        f.write(f'{key}_START={it["startDate"]}\n')
PY

# shellcheck source=/dev/null
. "${WORK}/ctx.env"

git fetch --tags --quiet origin 2>/dev/null || echo -e "${yellow}note${nc}: could not fetch tags; using local tags"
git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null 2>&1 ||
  fail "tag ${TAG} not found locally. Fetch it, or pass a version that has been tagged."

echo -e "   project      ${white}${PROJECT_TITLE}${nc} (#${PROJECT_NUMBER}, ${ORG})"
echo -e "   released     ${white}${N_TITLE}${nc}  tag ${TAG}  (started ${N_START})"
echo -e "   N+1          ${white}${N1_TITLE}${nc}  (started ${N1_START})"
echo -e "   N+2          ${white}${N2_TITLE}${nc}  (started ${N2_START})"
echo -e "   mode         $( $APPLY && echo -e "${red}APPLY${nc}" || echo -e "${green}dry-run${nc}" )"

step "Scanning board"

SCAN_ATTEMPT=0
while :; do
SCAN_ATTEMPT=$((SCAN_ATTEMPT + 1))
: >"${WORK}/pages.jsonl"
CURSOR=""
PAGE=0
COLLECTED=0
PAGE_RETRY=0
while :; do
  PAGE=$((PAGE + 1))
  if [ -z "$CURSOR" ]; then AFTER="null"; else AFTER="\"${CURSOR}\""; fi
  cat >"${WORK}/q-scan.graphql" <<EOF
query {
  organization(login: "${ORG}") {
    projectV2(number: ${PROJECT_NUMBER}) {
      items(first: 100, after: ${AFTER}) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content {
            __typename
            ... on Issue {
              number title url state stateReason
              repository { nameWithOwner }
            }
            ... on PullRequest {
              number title url state
              repository { nameWithOwner }
            }
            ... on DraftIssue { title }
          }
          status: fieldValueByName(name: "${STATUS_FIELD}") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          sprint: fieldValueByName(name: "${SPRINT_FIELD}") {
            ... on ProjectV2ItemFieldIterationValue { title }
          }
        }
      }
    }
  }
}
EOF
  gql "${WORK}/q-scan.graphql" "${WORK}/page.json"
  read -r N_NODES HAS_NEXT TOTAL NEXT_CURSOR < <(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
it = d["data"]["organization"]["projectV2"]["items"]
pi = it["pageInfo"]
print(len(it["nodes"]), pi["hasNextPage"], it.get("totalCount") or 0, pi["endCursor"] or "")
' "${WORK}/page.json")
  if { [ "$N_NODES" -eq 0 ] || [ "$TOTAL" -eq 0 ]; } &&
     { [ "$TOTAL" -eq 0 ] || [ "$COLLECTED" -lt "$TOTAL" ]; }; then
    PAGE_RETRY=$((PAGE_RETRY + 1))
    if [ "$PAGE_RETRY" -le 6 ]; then
      printf '\r   page %d came back empty; retrying in %ds   ' "$PAGE" "$((PAGE_RETRY * 10))"
      sleep $((PAGE_RETRY * 10))
      PAGE=$((PAGE - 1))
      continue
    fi
    break
  fi
  PAGE_RETRY=0
  cat "${WORK}/page.json" >>"${WORK}/pages.jsonl"
  COLLECTED=$((COLLECTED + N_NODES))
  CURSOR="$NEXT_CURSOR"
  printf '\r   page %d scanned (%d/%d items)        ' "$PAGE" "$COLLECTED" "$TOTAL"
  [ "$HAS_NEXT" = "True" ] || break
  sleep 1
done
echo

if python3 - "${WORK}/pages.jsonl" <<'PY'
import json, sys
txt = open(sys.argv[1]).read()
dec, i, collected, totals = json.JSONDecoder(), 0, 0, []
while i < len(txt):
    while i < len(txt) and txt[i] in " \n\r\t":
        i += 1
    if i >= len(txt):
        break
    obj, i = dec.raw_decode(txt, i)
    it = obj["data"]["organization"]["projectV2"]["items"]
    collected += len(it["nodes"])
    totals.append(it.get("totalCount") or 0)
expected = max(totals) if totals else 0
if expected and collected < expected:
    print("   truncated: collected %d of %d items" % (collected, expected), file=sys.stderr)
    sys.exit(1)
if not expected:
    print("   totalCount unavailable; cannot confirm the scan is complete", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY
then
  break
fi

if [ "$SCAN_ATTEMPT" -ge 4 ]; then
  fail "board scan kept coming back short after ${SCAN_ATTEMPT} attempts. GitHub truncates deep Projects pagination under load - wait a minute and re-run. Nothing has been changed."
fi
echo -e "   ${yellow}incomplete scan${nc}; restarting it (attempt $((SCAN_ATTEMPT + 1)) of 4)"
sleep 30
done

python3 - "${WORK}/pages.jsonl" "$N_TITLE" "$N1_TITLE" "${WORK}/items.json" <<'PY'
import json, sys
src, n_title, n1_title, out = sys.argv[1:5]
text = open(src).read()
dec, i, nodes = json.JSONDecoder(), 0, []
while i < len(text):
    while i < len(text) and text[i] in " \n\r\t":
        i += 1
    if i >= len(text):
        break
    obj, i = dec.raw_decode(text, i)
    nodes += obj["data"]["organization"]["projectV2"]["items"]["nodes"]
items = []
for nd in nodes:
    sprint = (nd.get("sprint") or {}).get("title")
    if sprint not in (n_title, n1_title):
        continue
    c = nd.get("content") or {}
    items.append({
        "item_id": nd["id"],
        "sprint": sprint,
        "status": (nd.get("status") or {}).get("name") or "(no status)",
        "type": c.get("__typename") or "DraftIssue",
        "number": c.get("number"),
        "title": c.get("title") or "",
        "url": c.get("url") or "",
        "state": c.get("state"),
        "state_reason": c.get("stateReason"),
        "repo": (c.get("repository") or {}).get("nameWithOwner"),
    })
json.dump(items, open(out, "w"), indent=1)
print(f"   {len(nodes)} items on the board")
print(f"   {sum(1 for x in items if x['sprint'] == n_title)} in {n_title}")
print(f"   {sum(1 for x in items if x['sprint'] == n1_title)} in {n1_title}")
PY

step "Resolving what shipped in ${TAG}"

python3 - "${WORK}/items.json" "$N_TITLE" "${WORK}/lookup_plan.json" <<'PY'
import json, sys
items, n_title, out = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3]
groups = {}
for x in items:
    if x["sprint"] != n_title or not x["number"] or not x["repo"]:
        continue
    groups.setdefault(x["repo"], []).append(x["number"])
json.dump({k: sorted(set(v)) for k, v in groups.items()}, open(out, "w"))
print(f"   {sum(len(v) for v in groups.values())} numbered cards to check across {len(groups)} repo(s)")
PY

: >"${WORK}/lookups.jsonl"
python3 -c '
import json, sys
g = json.load(open(sys.argv[1]))
size = int(sys.argv[2])
for repo, nums in g.items():
    for i in range(0, len(nums), size):
        print(repo, *nums[i:i + size])
' "${WORK}/lookup_plan.json" "$LOOKUP_BATCH" >"${WORK}/lookup_batches.txt"

BATCH_N=0
while read -r repo nums; do
  [ -n "${repo:-}" ] || continue
  BATCH_N=$((BATCH_N + 1))
  owner="${repo%%/*}"; name="${repo##*/}"
  {
    echo "query {"
    echo "  repository(owner: \"${owner}\", name: \"${name}\") {"
    for num in $nums; do
      cat <<EOF
    i${num}: issueOrPullRequest(number: ${num}) {
      __typename
      ... on Issue {
        number state stateReason
        closedByPullRequestsReferences(first: 20, includeClosedPrs: true) {
          nodes { number state mergeCommit { oid } }
        }
        timelineItems(first: 60, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT, CLOSED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent { source { ... on PullRequest { number state mergeCommit { oid } } } }
            ... on ConnectedEvent { subject { ... on PullRequest { number state mergeCommit { oid } } } }
            ... on ClosedEvent { closer { ... on PullRequest { number state mergeCommit { oid } } } }
          }
        }
      }
      ... on PullRequest { number state mergeCommit { oid } }
    }
EOF
    done
    echo "  }"
    echo "}"
  } >"${WORK}/q-lookup.graphql"
  gql "${WORK}/q-lookup.graphql" "${WORK}/lookup.json"
  python3 - "${WORK}/lookup.json" "$repo" >>"${WORK}/lookups.jsonl" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for e in (d.get("errors") or [])[:3]:
    print("   error: " + e.get("message", "?"), file=sys.stderr)
print(json.dumps({"repo": sys.argv[2],
                  "data": (d.get("data") or {}).get("repository") or {}}))
PY
  printf '\r   lookup batch %d done' "$BATCH_N"
  sleep 1
done <"${WORK}/lookup_batches.txt"
[ "$BATCH_N" -gt 0 ] && echo

python3 - "${WORK}/lookups.jsonl" "${WORK}/candidates.json" <<'PY'
import json, sys
src, out = sys.argv[1], sys.argv[2]
cands = {}
for line in open(src):
    line = line.strip()
    if not line:
        continue
    rec = json.loads(line)
    repo, data = rec["repo"], rec["data"]
    for alias, node in (data or {}).items():
        if not node:
            continue
        num = int(alias[1:])
        prs = {}

        def add(p):
            if p and p.get("number") and p.get("mergeCommit"):
                prs[p["number"]] = p["mergeCommit"]["oid"]

        mentions = {}

        def mention(p):
            if p and p.get("number") and p.get("mergeCommit"):
                mentions[p["number"]] = p["mergeCommit"]["oid"]

        if node.get("__typename") == "PullRequest":
            add(node)
        for p in ((node.get("closedByPullRequestsReferences") or {}).get("nodes") or []):
            add(p)
        for ev in ((node.get("timelineItems") or {}).get("nodes") or []):
            add(ev.get("closer") or {})
            add(ev.get("subject") or {})
            mention(ev.get("source") or {})
        cands[f"{repo}#{num}"] = {
            "repo": repo, "number": num,
            "state": node.get("state"), "state_reason": node.get("stateReason"),
            "prs": prs,
            "mentions": {k: v for k, v in mentions.items() if k not in prs},
        }
json.dump(cands, open(out, "w"), indent=1)
PY

python3 -c '
import json, sys
c = json.load(open(sys.argv[1]))
seen = set()
for v in c.values():
    seen.update(v["prs"].values())
print("\n".join(sorted(seen)))
' "${WORK}/candidates.json" >"${WORK}/commits.txt"

: >"${WORK}/shipped_commits.txt"
: >"${WORK}/commit_release.tsv"
MISSING_LOCALLY=0
SHIPPED_N=0
while read -r oid; do
  [ -n "${oid:-}" ] || continue
  if ! git cat-file -e "${oid}^{commit}" 2>/dev/null; then
    MISSING_LOCALLY=$((MISSING_LOCALLY + 1))
    continue
  fi
  if git merge-base --is-ancestor "$oid" "$TAG" 2>/dev/null; then
    echo "$oid" >>"${WORK}/shipped_commits.txt"
    rel="$(git tag --contains "$oid" 2>/dev/null | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | head -1)"
    printf '%s\t%s\n' "$oid" "${rel:-$TAG}" >>"${WORK}/commit_release.tsv"
    SHIPPED_N=$((SHIPPED_N + 1))
  fi
done <"${WORK}/commits.txt"
echo "   $(grep -c . "${WORK}/commits.txt" 2>/dev/null || echo 0) candidate merge commit(s), ${SHIPPED_N} in ${TAG}"
if [ "$MISSING_LOCALLY" -gt 0 ]; then
  echo -e "   ${yellow}note${nc}: ${MISSING_LOCALLY} merge commit(s) absent locally and treated as not shipped"
fi

step "Building plan"

python3 - "${WORK}/items.json" "${WORK}/candidates.json" "${WORK}/shipped_commits.txt" \
  "$N_TITLE" "$N1_TITLE" "$N2_TITLE" "$INCLUDE_DONE" "$SKIP_DONE_PASS" "${WORK}/plan.json" <<'PY'
import json, sys
(items_f, cands_f, shipped_f, n_t, n1_t, n2_t,
 include_done, skip_done, out) = sys.argv[1:10]
items = json.load(open(items_f))
cands = json.load(open(cands_f))
shipped_commits = {l.strip() for l in open(shipped_f) if l.strip()}
commit_release = {}
try:
    for line in open(shipped_f.replace("shipped_commits.txt", "commit_release.tsv")):
        parts = line.rstrip("\n").split("\t")
        if len(parts) == 2:
            commit_release[parts[0]] = parts[1]
except OSError:
    pass
include_done = include_done == "true"
skip_done = skip_done == "true"

mark_done, move_n1, move_n, skipped, anomalies = [], [], [], [], []
for x in items:
    key = f'{x["repo"]}#{x["number"]}' if x["number"] and x["repo"] else None
    c = cands.get(key) if key else None
    hits = sorted({pr for pr, oid in (c or {}).get("prs", {}).items() if oid in shipped_commits})
    rels = sorted({commit_release.get(oid, "") for pr, oid in (c or {}).get("prs", {}).items()
                   if oid in shipped_commits} - {""})
    closed_ok = (x["state"] == "MERGED"
                 or (x["state"] == "CLOSED" and x["state_reason"] in (None, "COMPLETED")))
    x = dict(x, shipped_prs=hits, shipped_in=rels)
    if hits and not closed_ok:
        anomalies.append(dict(x, why=(
            "closing PR #%s shipped in %s but the issue is still %s - left for a human, not marked Done"
            % (hits[0], ", ".join(rels) or "an earlier release", x["state"] or "?"))))
        hits = []
        x = dict(x, shipped_prs=[])

    if x["sprint"] == n1_t:
        if x["status"] == "Done" and not include_done:
            skipped.append(dict(x, why=f"Done in {n1_t}; left in place (use --include-done to move)"))
        else:
            move_n1.append(x)
        continue

    if hits:
        if x["status"] != "Done" and not skip_done:
            mark_done.append(x)
        elif x["status"] != "Done" and skip_done:
            move_n.append(x)
            anomalies.append(dict(x, why=f"shipped via #{hits[0]} but --skip-done-pass left it not Done, so it was moved"))
        else:
            skipped.append(dict(x, why=f"already Done and shipped; stays in {n_t}"))
        continue

    if x["status"] == "Done":
        skipped.append(dict(x, why=f"Done in {n_t}; stays in {n_t}"))
        if x["state"] == "OPEN":
            anomalies.append(dict(x, why="marked Done on the board but the issue is still OPEN"))
        continue

    move_n.append(x)
    if x["state"] == "CLOSED" and x["state_reason"] == "COMPLETED":
        anomalies.append(dict(x, why="closed as completed but not Done and no PR in the tag; carried forward"))
    if x["status"] == "Blocked":
        anomalies.append(dict(x, why="Blocked; carried forward still blocked"))

plan = {
    "iterations": {"n": n_t, "n1": n1_t, "n2": n2_t},
    "mark_done": mark_done,
    "move_n1_to_n2": move_n1,
    "move_n_to_n1": move_n,
    "skipped": skipped,
    "anomalies": anomalies,
}
json.dump(plan, open(out, "w"), indent=1)
print(f"   mark Done, stay in {n_t}: {len(mark_done)}")
print(f"   move {n1_t} -> {n2_t}:      {len(move_n1)}")
print(f"   move {n_t} -> {n1_t}:      {len(move_n)}")
print(f"   left alone:              {len(skipped)}")
print(f"   anomalies to eyeball:    {len(anomalies)}")
PY

mutate() {
  local label="$1" kind="$2" value_id="$3" ids_file="$4"
  local total chunk=0 start=1 field_id chunk_n
  total="$(grep -c . "$ids_file" 2>/dev/null || true)"
  total="${total:-0}"
  [ "$total" -gt 0 ] || { echo -e "   ${label}: nothing to do"; return 0; }
  if ! $APPLY; then
    echo -e "   ${green}would${nc} ${label}: ${total} item(s)"
    return 0
  fi
  if [ "$kind" = iteration ]; then field_id="$SPRINT_FIELD_ID"; else field_id="$STATUS_FIELD_ID"; fi
  while [ "$start" -le "$total" ]; do
    chunk=$((chunk + 1))
    sed -n "${start},$((start + BATCH_SIZE - 1))p" "$ids_file" >"${WORK}/.chunk"
    python3 - "${WORK}/.chunk" "$PROJECT_ID" "$field_id" "$kind" "$value_id" \
      >"${WORK}/q-mutate.graphql" <<'PY'
import sys
ids = [l.strip() for l in open(sys.argv[1]) if l.strip()]
project, field, kind, value = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
if kind == "iteration":
    val = '{iterationId: "%s"}' % value
else:
    val = '{singleSelectOptionId: "%s"}' % value
print("mutation {")
for i, iid in enumerate(ids):
    print('  m%d: updateProjectV2ItemFieldValue(input: {projectId: "%s", itemId: "%s", '
          'fieldId: "%s", value: %s}) { projectV2Item { id } }'
          % (i, project, iid, field, val))
print("}")
PY
    gql "${WORK}/q-mutate.graphql" "${WORK}/mutate.json"
    chunk_n="$(grep -c . "${WORK}/.chunk" 2>/dev/null || true)"
    python3 - "${WORK}/mutate.json" "${chunk_n:-0}" <<'PY' || fail "${label}: chunk ${chunk} did not fully apply; re-run to retry the remainder"
import json, sys
d = json.load(open(sys.argv[1]))
want = int(sys.argv[2])
got = len([k for k, v in (d.get("data") or {}).items() if v])
for e in (d.get("errors") or [])[:5]:
    print("   error: " + e.get("message", "?"), file=sys.stderr)
print("   applied %d/%d" % (got, want))
sys.exit(0 if got == want else 1)
PY
    start=$((start + BATCH_SIZE))
  done
  echo -e "   ${green}done${nc} ${label}: ${total} item(s)"
}

ids_for() {
  python3 -c '
import json, sys
print("\n".join(x["item_id"] for x in json.load(open(sys.argv[1]))[sys.argv[2]]))
' "${WORK}/plan.json" "$1" | sed '/^$/d'
}

ROLL_DONE="$(python3 -c '
import json, sys
p = json.load(open(sys.argv[1]))
print(int(not p["mark_done"] and not p["move_n_to_n1"] and bool(p["move_n1_to_n2"])))
' "${WORK}/plan.json")"

if [ "$ROLL_DONE" = "1" ] && ! $FORCE; then
  echo
  echo -e "${yellow}Nothing to carry forward from ${N_TITLE}.${nc}"
  echo "  Every ${N_TITLE} card is already Done, so there is no carry-over that"
  echo "  needs room made for it in ${N1_TITLE}. Moving ${N1_TITLE} -> ${N2_TITLE} now"
  echo "  would shift the board a second time, including the cards a previous"
  echo "  run already carried into ${N1_TITLE}."
  echo
  echo "  This usually means the rollover for ${N_TITLE} has already been applied."
  echo -e "  If you really intend to shift ${N1_TITLE} anyway, re-run with ${white}--force${nc}."
  echo
  exit 0
fi

step "Proposed changes"

python3 - "${WORK}/plan.json" <<'PY'
import json, sys
plan = json.load(open(sys.argv[1]))
it = plan["iterations"]
W = 58


def row(num, title, extra):
    tag = f'#{num}' if num else '(draft)'
    t = title if len(title) <= W else title[:W - 1] + "\u2026"
    return f'   {tag:<8} {t:<{W}} {extra}'


def block(heading, rows, extra):
    print(f'\n  {heading} ({len(rows)})')
    if not rows:
        print('   (none)')
        return
    for x in rows:
        print(row(x["number"], x["title"], extra(x)))


block(f'Mark Done, stay in {it["n"]}', plan["mark_done"],
      lambda x: f'{x["status"]} -> Done')
block(f'Move {it["n1"]} -> {it["n2"]}', plan["move_n1_to_n2"],
      lambda x: f'{it["n1"]} -> {it["n2"]}  [{x["status"]} kept]')
block(f'Move {it["n"]} -> {it["n1"]}', plan["move_n_to_n1"],
      lambda x: f'{it["n"]} -> {it["n1"]}  [{x["status"]} kept]')

if plan["anomalies"]:
    print(f'\n  Needs a human decision ({len(plan["anomalies"])}) - not acted on')
    for x in plan["anomalies"]:
        print(row(x["number"], x["title"], ""))
        print(f'            -> {x["why"]}')

n = len(plan["mark_done"]) + len(plan["move_n1_to_n2"]) + len(plan["move_n_to_n1"])
print(f'\n  {n} card(s) will change; {len(plan["skipped"])} left untouched.')
PY

if $APPLY && ! $ASSUME_YES; then
  if [ ! -t 0 ] && [ ! -e /dev/tty ]; then
    fail "--apply needs a terminal for approval; pass --yes to skip the prompt"
  fi
  echo
  printf 'Apply these changes to the %s board? [y/N] ' "$PROJECT_TITLE"
  read -r reply </dev/tty
  case "$reply" in
    y|Y|yes|YES) echo -e "${green}approved${nc}" ;;
    *) echo -e "${yellow}aborted - nothing changed${nc}"; exit 0 ;;
  esac
fi

step "Marking shipped ${N_TITLE} cards Done"
if $SKIP_DONE_PASS; then
  echo -e "   ${yellow}skipped${nc} (--skip-done-pass)"
else
  ids_for mark_done >"${WORK}/ids-done.txt"
  mutate "set Status=Done in ${N_TITLE}" status "$DONE_OPTION_ID" "${WORK}/ids-done.txt"
fi

step "Moving ${N1_TITLE} -> ${N2_TITLE}"
ids_for move_n1_to_n2 >"${WORK}/ids-n1.txt"
mutate "move to ${N2_TITLE}" iteration "$N2_ID" "${WORK}/ids-n1.txt"

step "Moving ${N_TITLE} -> ${N1_TITLE}"
ids_for move_n_to_n1 >"${WORK}/ids-n.txt"
mutate "move to ${N1_TITLE}" iteration "$N1_ID" "${WORK}/ids-n.txt"

step "Verifying"
if ! $APPLY; then
  echo -e "   ${yellow}skipped${nc} (dry-run)"
else
  cat "${WORK}/ids-n1.txt" "${WORK}/ids-n.txt" >"${WORK}/ids-moved.txt"
  [ "${SKIP_DONE_PASS}" = true ] || cat "${WORK}/ids-done.txt" >>"${WORK}/ids-moved.txt"
  sort -u "${WORK}/ids-moved.txt" | sed '/^$/d' >"${WORK}/ids-verify.txt"
  if [ -s "${WORK}/ids-verify.txt" ]; then
    python3 - "${WORK}/ids-verify.txt" "$STATUS_FIELD" "$SPRINT_FIELD" \
      >"${WORK}/q-verify.graphql" <<'PY'
import json, sys
ids = [l.strip() for l in open(sys.argv[1]) if l.strip()]
status_field, sprint_field = sys.argv[2], sys.argv[3]
inner = ",".join(json.dumps(i) for i in ids)
print(
    "query { nodes(ids: [" + inner + "]) { ... on ProjectV2Item { id "
    "content { ... on Issue { number } ... on PullRequest { number } } "
    'status: fieldValueByName(name: "' + status_field + '") '
    "{ ... on ProjectV2ItemFieldSingleSelectValue { name } } "
    'sprint: fieldValueByName(name: "' + sprint_field + '") '
    "{ ... on ProjectV2ItemFieldIterationValue { title } } } } }"
)
PY
    gql "${WORK}/q-verify.graphql" "${WORK}/verify.json"
    python3 - "${WORK}/verify.json" "${WORK}/plan.json" "$SKIP_DONE_PASS" <<'PY'
import json, sys
v, plan, skip_done = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3] == "true"
actual = {}
for n in (v.get("data") or {}).get("nodes") or []:
    if not n:
        continue
    actual[n["id"]] = ((n.get("sprint") or {}).get("title"),
                       (n.get("status") or {}).get("name"))
it = plan["iterations"]
expect = {}
if not skip_done:
    for x in plan["mark_done"]:
        expect[x["item_id"]] = (it["n"], "Done")
for x in plan["move_n1_to_n2"]:
    expect[x["item_id"]] = (it["n2"], x["status"])
for x in plan["move_n_to_n1"]:
    expect[x["item_id"]] = (it["n1"], x["status"])
bad = []
for iid, (want_sprint, want_status) in expect.items():
    got = actual.get(iid)
    if got is None:
        bad.append((iid, "not returned", ""))
    elif got[0] != want_sprint or (want_status and got[1] != want_status):
        bad.append((iid, f"want {want_sprint}/{want_status}", f"got {got[0]}/{got[1]}"))
if bad:
    print(f"   {len(bad)} item(s) did not match:", file=sys.stderr)
    for b in bad[:15]:
        print("     " + " | ".join(b), file=sys.stderr)
    sys.exit(1)
print(f"   all {len(expect)} touched item(s) match the plan")
PY
  fi
fi

step "Writing report"

python3 - "${WORK}/plan.json" "$TAG" "$APPLY" "$REPORT" <<'PY'
import datetime, json, sys
plan, tag, applied, out = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3] == "true", sys.argv[4]
it = plan["iterations"]
L = []
L.append(f'# Sprint rollover - {it["n"]} ({tag})')
L.append("")
L.append(f'- Run: {datetime.datetime.now().astimezone().isoformat(timespec="seconds")}')
L.append(f'- Mode: {"APPLIED" if applied else "dry-run (no changes made)"}')
L.append(f'- Shift: {it["n1"]} -> {it["n2"]}, then {it["n"]} -> {it["n1"]}')
L.append("")


def table(rows, headers, fmt):
    if not rows:
        return ["_none_", ""]
    o = ["| " + " | ".join(headers) + " |",
         "|" + "|".join("---" for _ in headers) + "|"]
    o += ["| " + " | ".join(fmt(r)) + " |" for r in rows]
    o.append("")
    return o


def ref(x):
    return f'[#{x["number"]}]({x["url"]})' if x.get("number") else "(draft)"


L.append(f'## Marked Done, stayed in {it["n"]} ({len(plan["mark_done"])})')
L.append("")
L += table(plan["mark_done"], ["Card", "Was", "Closed by", "Shipped in", "Title"],
           lambda x: [ref(x), x["status"],
                      ", ".join(f'#{p}' for p in x["shipped_prs"]) or "-",
                      ", ".join(x.get("shipped_in") or []) or "-",
                      x["title"][:60]])

L.append(f'## Moved {it["n1"]} -> {it["n2"]} ({len(plan["move_n1_to_n2"])})')
L.append("")
L += table(plan["move_n1_to_n2"], ["Card", "Status (unchanged)", "Title"],
           lambda x: [ref(x), x["status"], x["title"][:70]])

L.append(f'## Moved {it["n"]} -> {it["n1"]} ({len(plan["move_n_to_n1"])})')
L.append("")
L += table(plan["move_n_to_n1"], ["Card", "Status (unchanged)", "Title"],
           lambda x: [ref(x), x["status"], x["title"][:70]])

L.append(f'## Left in place ({len(plan["skipped"])})')
L.append("")
L += table(plan["skipped"], ["Card", "Status", "Why"],
           lambda x: [ref(x), x["status"], x["why"]])

L.append(f'## Anomalies worth a human look ({len(plan["anomalies"])})')
L.append("")
L += table(plan["anomalies"], ["Card", "Status", "State", "Note"],
           lambda x: [ref(x), x["status"],
                      f'{x.get("state") or "-"}/{x.get("state_reason") or "-"}', x["why"]])

open(out, "w").write("\n".join(L) + "\n")
print(f"   {out}")
PY

if $APPLY; then
  echo -e "\n${green}Rollover applied.${nc} Report: ${white}${REPORT}${nc}"
else
  echo -e "\n${yellow}Dry run only - nothing changed.${nc} Report: ${white}${REPORT}${nc}"
  echo -e "Re-run with ${white}--apply${nc} to perform it."
fi
report_rate_limits
