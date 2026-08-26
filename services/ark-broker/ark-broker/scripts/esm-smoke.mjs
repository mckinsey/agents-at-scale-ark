// Guards against ESM/CommonJS import regressions that Jest (which runs under
// CommonJS via ts-jest) cannot catch. The broker ships as native ESM
// ("type": "module"), so a CJS dependency imported with a named import that
// the CJS lexer cannot detect throws at module load — a boot-time crash the
// unit suite never exercises. Import the built ESM output under plain node and
// fail if it does not load.
const target = new URL(
  '../dist/brokers/stream/in-memory-stream.js',
  import.meta.url
);

try {
  const mod = await import(target.href);
  if (typeof mod.InMemoryStream !== 'function') {
    console.error('esm-smoke: InMemoryStream export missing from built output');
    process.exit(1);
  }
  console.log('esm-smoke ok: built ESM modules import under native node');
} catch (err) {
  console.error('esm-smoke failed:', err && err.message ? err.message : err);
  process.exit(1);
}
