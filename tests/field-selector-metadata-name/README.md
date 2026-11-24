# Field selector on metadata.name

Verifies that `--field-selector metadata.name=X` actually filters against the
aggregated PostgreSQL apiserver (rather than silently returning every item).

## What it tests
- Create three Models with distinct names
- List with `--field-selector metadata.name=<one>` and assert exactly one item
  comes back, with the requested name
- List with an unsupported field selector and assert a 400 Bad Request

Under the pre-fix backend, `opts.FieldSelector` was silently dropped: the
list returned every item regardless of the requested filter — a correctness
bug (over-broad response, potential cross-tenant leak in a multi-tenant
setup). The fix translates supported fields to SQL and rejects the rest.

## Running

```bash
chainsaw test tests/field-selector-metadata-name/
```

Successful completion confirms field selectors are honoured (for supported
fields) and rejected loudly (for unsupported ones), rather than ignored.
