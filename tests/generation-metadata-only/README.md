# Generation only bumps on spec change

Verifies that `.metadata.generation` increments only when `.spec` changes on
the aggregated PostgreSQL apiserver — not on label, annotation, or status
updates. This is what controllers rely on for the
generation/observedGeneration reconciliation pattern.

## Running

```bash
chainsaw test tests/generation-metadata-only/
```
