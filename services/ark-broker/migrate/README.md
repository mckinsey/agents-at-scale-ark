# ark-broker-migrate

Applies ark-broker Postgres schema migrations using golang-migrate as a library.

Built from source instead of the upstream `migrate/migrate` image so the Go
toolchain and dependency versions are declared in `go.mod` and scanned by CI.
The binary links only the `postgres` (lib/pq) and `file` drivers.

## Dependency pins

golang-migrate declares every database driver as a direct dependency, so its
vulnerable transitive modules stay in the module graph even though this binary
never links them. The `replace` directives in `go.mod` force patched versions.
Remove a pin once golang-migrate requires that version or higher itself.
