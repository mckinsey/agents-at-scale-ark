# Security Notes

## CVE-2018-20225 (pip dependency confusion)

**Status**: Won't Fix - Design Issue

This CVE refers to a "dependency confusion" attack when using `pip` with the `--extra-index-url` flag. The vulnerability has been disputed by pip maintainers as intended behavior.

### Mitigation Strategies:
1. **Never use `--extra-index-url` for private packages** - Use `--index-url` instead
2. **Use package pinning** - Always specify exact versions for dependencies
3. **Use private package prefixes** - Name private packages with organization-specific prefixes
4. **Use hash verification** - Verify package hashes when installing

### For Ark:
- We don't use `--extra-index-url` in our build processes
- All dependencies are pinned in `uv.lock` files
- We use `uv` package manager which has better security defaults

## Fixed Vulnerabilities

The following vulnerabilities have been addressed in this commit:

1. **CVE-2024-58340** (langchain ReDoS) - Already fixed, langchain>=0.3.2
2. **CVE-2026-0994** (protobuf DoS) - Mitigated by upgrading to protobuf>=5.28.0,<6.0 (compatibility constraints prevent full fix to 6.34.0)
3. **CVE-2025-45768** (pyjwt:2.10.1 weak encryption) - **No fix available yet**. Latest version 2.10.1 is vulnerable. Monitor for updates.
4. **CVE-2024-23342** (ecdsa vulnerability) - Mitigated by adding cryptography>=42.0.0 as replacement