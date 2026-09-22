# Inline Tools: delivery workflow (worktrees + stacked PRs)

How this change is delivered. Scoped to `inline-tools`, so it archives with the
change instead of living in the repository `CLAUDE.md`.

Implement the change one phase at a time. Each phase is its own short
stack of small PRs, created with the `github/gh-stack` extension, based on
`main` when the previous phase has merged.

Prefer to merge a phase before the next opens: merge order carries the
dependency, which works because an unfinished feature should be inert by
default (see the disabled-by-default flag rule below). When phase N's PR is
still open and phase N+1 cannot wait, base phase N+1 on phase N's branch and
set that branch as the PR base. The cost is real — a review comment at the
bottom rebases everything above it — so stack across phases only while the
lower phase is genuinely in flight, and rebase onto `main` once it merges.

Before the first phase:

1. Merge the change's spec (`openspec/changes/<change>/`) to `main` on its own.
   It is docs-only, so `cicd.yaml`'s `paths-ignore` means it runs almost no CI,
   and it gets the contract reviewed first.
2. Land any pre-existing bug fix the change depends on as its own PR on `main`,
   not inside the feature. Record it in `proposal.md`/`tasks.md` as a
   prerequisite.

Per phase, from the main checkout on trunk:

```bash
git worktree add ../<change>-phase1 -b <change>-phase1 origin/main
cd ../<change>-phase1
# split the phase into its units, bottom first
gh stack init <change>-p1-schema <change>-p1-api <change>-p1-dashboard
```

Then:

1. One worktree per **phase**, not per PR. Use `gh stack add` for each
   subsequent unit; 5-7 branches in one directory, not 7 worktrees.
2. Open PRs as drafts as soon as the first commit exists so the stack is
   visible: `gh stack submit --auto`.
3. `make lint` and `make test` must pass in every directory the unit touches
   before the draft is marked ready (`gh stack submit --open`).
4. After a lower PR merges: `gh stack sync` then `gh stack rebase`.
5. When the whole phase has merged, remove the worktree
   (`git worktree remove ../<dir>`) and start the next phase from `main`. If a
   later phase was stacked on this one, rebase it onto `main` and repoint its
   PR base.

Rules:

- Split a phase into 5-7 units, not a fixed number. Mechanically splittable is
  not the same as safely splittable: units that would leave the tree in a state
  the spec forbids (a schema accepting a value nothing authorises, a flag with
  no enforcement) belong in one PR.
- Give the security-critical decision its own PR, ideally pure logic separated
  from its wiring, so a security reviewer reads one small file rather than
  hunting the decision across the change.
- Keep an unfinished feature disabled by default (chart flag defaulting false,
  and a render guard if enabling it without its enforcement is unsafe). That is
  what makes merging phase N before N+1 exists safe.
- Phase order follows the dependency order in the change's `tasks.md`. Do not
  start a phase whose prerequisites are unmerged.
- `tasks.md` checkboxes are ticked in the phase that implements them and land
  when that phase merges.
- `gh stack` navigation (`up`, `down`, `checkout`, `switch`) changes branches in
  the current checkout and fails on a branch held by another worktree. With
  worktrees, `cd` to the phase directory instead; use `gh stack view`,
  `submit`, `sync`, and `rebase` only.
- Conventional-commit title per PR, scoped to the change, e.g.
  `feat(inline-tools): add the inline Tool schema and author admission`.
- CI is not free: `cicd.yaml` runs ~20 jobs including six e2e suites per PR,
  and every restack re-runs them. That cost is the reason for 5-7 units per
  phase rather than one per file.

## Testing a phase in an isolated cluster

Give each phase its own Colima k3s profile, so a half-installed webhook or a
leftover CRD from another phase cannot be mistaken for a regression, and so
phases that disagree about correct behaviour (phase 1: authored but Pending;
phase 2: runner provisioned) never share a cluster.

```bash
colima start <change>-p1 --kubernetes --cpu 4 --memory 8 --disk 60
kubectl config use-context colima-<change>-p1
```

- Size for the phase: an authoring-only phase provisions no pods and needs
  little; a runner phase needs more and has to load images into the VM.
- Profiles are separate VMs, so run them one at a time rather than in parallel.
- k3s ships flannel, which does **not** enforce NetworkPolicy. A phase whose
  tests assert that traffic is blocked needs a profile started with an
  enforcing CNI; deciding that is per-profile and cannot be retrofitted.
- Envtest and unit tests still come first. The cluster is for what they cannot
  prove: real admission wiring at `failurePolicy: Fail`, Helm install, and RBAC
  denial of an actual unprivileged user.

