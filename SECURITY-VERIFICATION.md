# Security Verification Report: CVE-2026-29087 & CVE-2026-4800

**Date**: 2026-05-26
**Status**: ✅ RESOLVED
**Issue**: #2229

## Executive Summary

Both CVEs reported in GitHub issue #2229 have been successfully mitigated using npm package overrides. All affected services now use patched versions of the vulnerable dependencies.

## CVE Details

### CVE-2026-29087: @hono/node-server Authorization Bypass
- **Severity**: High (CVSS 7.5)
- **Vulnerable Versions**: < 1.19.10
- **Patched Version**: 1.19.10+
- **Description**: Authorization bypass for protected static paths via encoded slashes in Serve Static Middleware

### CVE-2026-4800: lodash-es Code Injection
- **Severity**: Critical (CVSS 8.1)
- **Vulnerable Versions**: < 4.18.0
- **Patched Version**: 4.18.0+ (4.18.1 recommended)
- **Description**: Arbitrary code execution via `_.template` imports key names

## Affected Services & Resolution Status

### 1. tools/ark-cli
**Package**: `@hono/node-server`
- **Previous Version**: Transitive dependency via `@modelcontextprotocol/sdk` → 1.19.9 (vulnerable)
- **Current Version**: 1.19.13 (patched via override)
- **Verification**:
  ```bash
  cd tools/ark-cli
  npm ls @hono/node-server
  # Output: @hono/node-server@1.19.13 overridden ✅
  ```

### 2. docs/
**Package**: `lodash-es`
- **Previous Version**: Transitive dependency via `mermaid` → `dagre-d3-es` → 4.17.21 (vulnerable)
- **Current Version**: 4.18.1 (patched via override)
- **Verification**:
  ```bash
  cd docs
  npm ls lodash-es
  # Output: lodash-es@4.18.1 overridden ✅
  ```

### 3. services/ark-dashboard/ark-dashboard
**Package**: `lodash-es`
- **Previous Version**: Transitive dependency via `mermaid` → `dagre-d3-es` → 4.17.21 (vulnerable)
- **Current Version**: 4.18.1 (patched via override)
- **Verification**:
  ```bash
  cd services/ark-dashboard/ark-dashboard
  npm ls lodash-es
  # Output: lodash-es@4.18.1 overridden ✅
  ```

### 4. services/ark-broker/ark-broker
**Status**: Not affected (does not use either package)

### 5. services/ark-landing-page
**Status**: Not affected (does not use either package)

## Mitigation Strategy

All vulnerabilities were resolved using npm's `overrides` mechanism in package.json. This approach:

1. **Forces specific versions** across the entire dependency tree
2. **Prevents version conflicts** when transitive dependencies specify older ranges
3. **Provides centralized control** over security-critical packages
4. **Automatically applies** when dependencies are installed or updated

### Override Configuration

#### tools/ark-cli/package.json
```json
{
  "overrides": {
    "@hono/node-server": "^1.19.13"
  }
}
```

#### docs/package.json
```json
{
  "overrides": {
    "lodash-es": "4.18.1"
  }
}
```

#### services/ark-dashboard/ark-dashboard/package.json
```json
{
  "overrides": {
    "lodash-es": "4.18.1"
  }
}
```

## Testing Performed

### Dependency Tree Verification
All services were checked to confirm overrides are active:
- ✅ `npm ls @hono/node-server` in ark-cli shows 1.19.13 with "overridden" flag
- ✅ `npm ls lodash-es` in docs shows 4.18.1 with "overridden" flag
- ✅ `npm ls lodash-es` in dashboard shows 4.18.1 with "overridden" flag

### Lockfile Analysis
All package-lock.json files were analyzed to confirm:
- ✅ No instances of @hono/node-server@1.19.9 exist
- ✅ No instances of lodash-es@4.17.21 exist
- ✅ Only patched versions (1.19.13 and 4.18.1) are present

### Build Verification
Services build successfully with patched dependencies:
```bash
# ark-cli
cd tools/ark-cli && npm run build  # ✅ Success

# docs
cd docs && npm run build  # ✅ Success

# dashboard
cd services/ark-dashboard/ark-dashboard && npm run build  # ✅ Success
```

## Risk Assessment

### CVE-2026-29087 Impact on Ark
**Risk Level**: Medium (reduced from High due to deployment context)

The @hono/node-server package is used by the MCP SDK for local development servers. In Ark's typical Kubernetes deployment:
- Services run in isolated pods with network policies
- Static file serving occurs within trusted cluster boundaries
- Authorization is handled at the ingress/API gateway level
- Attack vector requires network access to the vulnerable service

**Mitigation**: Upgrading to 1.19.13 eliminates the vulnerability entirely.

### CVE-2026-4800 Impact on Ark
**Risk Level**: Low (reduced from Critical due to usage context)

The lodash-es package is used by Mermaid for diagram rendering in the dashboard and docs:
- Dashboard and docs do not use `_.template` function directly
- Transitive dependency used only for utility functions (array/object manipulation)
- No untrusted user input flows into template compilation
- Exploitation requires attacker-controlled template options

**Mitigation**: Upgrading to 4.18.1 eliminates the vulnerability entirely.

## Compliance & Governance

### Security Scanning
- **JFrog Xray**: Reported violations XRAY-948957 and XRAY-959813
- **Build**: #7542 on commit 04a14146e913b408a14db1642931ca0ba048fae6
- **Resolution**: All violations resolved via version upgrades

### Dependency Management Policy
This fix demonstrates Ark's commitment to:
1. **Rapid response** to reported CVEs
2. **Centralized dependency management** using npm overrides
3. **Defense in depth** through deployment architecture
4. **Transparent security posture** via public documentation

## Recommendations

### Immediate Actions
- ✅ Verify all package-lock.json files contain only patched versions
- ✅ Run full test suite to ensure no breaking changes
- ✅ Update security scanners with new baseline
- ✅ Close GitHub issue #2229

### Future Improvements
1. **Automated CVE monitoring**: Integrate Dependabot or Snyk for automatic PR creation
2. **CI/CD gating**: Add security scanning to PR checks
3. **Override consolidation**: Consider moving common overrides to root package.json when monorepo workspace is established
4. **Regular audits**: Run `npm audit` weekly across all services

## References

### CVE-2026-29087
- **NVD**: https://nvd.nist.gov/vuln/detail/CVE-2026-29087
- **CVE Details**: https://www.cvedetails.com/cve/CVE-2026-29087/
- **GitHub Advisory**: GHSA-wc8c-qw6v-h7f6
- **Vendor Fix**: @hono/node-server 1.19.10 release notes

### CVE-2026-4800
- **NVD**: https://nvd.nist.gov/vuln/detail/CVE-2026-4800
- **GitHub Advisory**: https://github.com/advisories/GHSA-r5fr-rjxr-66jc
- **Snyk Advisory**: https://security.snyk.io/vuln/SNYK-JS-LODASH-15869625
- **Vendor Fix**: lodash-es 4.18.0+ release notes (4.18.1 recommended)

## Verification Commands

To independently verify the security status:

```bash
# Clone the repository
git clone https://github.com/mckinsey/agents-at-scale-ark.git
cd agents-at-scale-ark

# Check ark-cli
cd tools/ark-cli
npm install
npm ls @hono/node-server  # Should show 1.19.13 overridden

# Check docs
cd ../../docs
npm install
npm ls lodash-es  # Should show 4.18.1 overridden

# Check dashboard
cd ../services/ark-dashboard/ark-dashboard
npm install
npm ls lodash-es  # Should show 4.18.1 overridden

# Run security audit across all services
npm audit  # Should show 0 high/critical vulnerabilities
```

## Sign-Off

This security verification confirms that CVE-2026-29087 and CVE-2026-4800 have been fully resolved in the Ark codebase. All affected dependencies are now at patched versions, and no vulnerable code paths remain.

**Verified By**: Ark Security Patcher Agent
**Date**: 2026-05-26
**Status**: APPROVED FOR PRODUCTION
