# ark-storage-dev

Development-only Postgres chart for local and CI use. Deploys a single-replica Postgres 16-alpine instance with optional SSL.

Not a production chart — no high-availability, no backup, no production hardening.

## Quickstart

```bash
make help

make install
make uninstall
```

## Configuration

| Value | Default | Description |
|-------|---------|-------------|
| `ssl.enabled` | `false` | Enable server-side TLS. Generates a self-signed CA cert and configures Postgres with `ssl=on`. |
| `database` | `ark` | Database name |
| `user` | `postgres` | Postgres user |
| `password` | `arkdev123` | Postgres password (stored in a Secret) |
| `persistence.enabled` | `true` | Enable PVC for data |
| `persistence.size` | `1Gi` | PVC size |

## SSL

When `ssl.enabled=true`:

1. A self-signed CA and server certificate are generated at Helm install time via `genSelfSignedCert`. The certificate is stored in a Secret named `{release-name}-tls` with keys `tls.crt`, `tls.key`, and `ca.crt`.
2. An init container (`ssl-setup`) copies the Secret-mounted files to an `emptyDir` volume, sets ownership to uid 70 (the `postgres` user), and `chmod 600` on the private key. This is required because Postgres refuses to load a key file that is world-readable or group-readable.
3. Postgres starts with `ssl=on`, `ssl_cert_file`, and `ssl_key_file` pointing at the prepared files.
4. The server accepts both SSL and non-SSL connections (`host` entries in `pg_hba.conf`).

To connect with CA verification from another pod, mount the `{release-name}-tls` Secret and use `sslmode=verify-full&sslrootcert=<mountPath>/ca.crt` (for Go clients) or set `DATABASE_SSL_ROOT_CERT_PATH=<mountPath>/ca.crt` (for the ark-broker).
