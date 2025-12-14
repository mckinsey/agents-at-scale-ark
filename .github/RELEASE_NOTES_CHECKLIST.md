# Release Notes Checklist

Use this checklist when preparing a release to ensure comprehensive release notes.

## Before Release

- [ ] **Review Draft Release Notes**: Check auto-generated notes from Release Drafter
- [ ] **Add Release Highlights**: Write 2-3 sentence summary of major changes
- [ ] **Verify Breaking Changes**: Ensure all breaking changes are clearly documented
- [ ] **Update Migration Guide**: Add migration steps for breaking changes (if any)
- [ ] **Check Security Fixes**: Ensure security issues are properly disclosed
- [ ] **Verify Installation Instructions**: Test that helm/docker/npm install commands work

## Release Notes Content

### Must Include:
- [ ] **Version number** and release date
- [ ] **What's New**: Key features and improvements
- [ ] **Breaking Changes**: With migration guide
- [ ] **Security Fixes**: CVEs addressed
- [ ] **Known Issues**: Current limitations
- [ ] **Contributors**: Thank all contributors

### Should Include:
- [ ] **Performance improvements** with benchmarks (if applicable)
- [ ] **Deprecation notices** for upcoming removals
- [ ] **Dependency updates** (major versions only)
- [ ] **Bug fixes** (major ones)
- [ ] **Installation/upgrade instructions**
- [ ] **Links**: Full changelog, docs, issues

### Optional:
- [ ] **Screenshots/demos** for UI changes
- [ ] **Architecture diagrams** for major changes
- [ ] **Benchmarks** for performance improvements

## After Release

- [ ] Announce release in Discussions
- [ ] Update documentation site
- [ ] Close milestone (if using)
- [ ] Tag Docker images as `latest` (if stable)

## Tips for Great Release Notes

1. **Write for your audience**: Assume users are familiar with the project but not daily contributors
2. **Be specific**: "Improved performance" → "Reduced API latency from 200ms to 50ms"
3. **Link to PRs/Issues**: Let users dive deeper if needed
4. **Group related changes**: Don't just list PRs, tell a story
5. **Highlight impact**: Explain WHY changes matter, not just WHAT changed
6. **Keep it scannable**: Use headings, bullets, and formatting
7. **Test upgrade path**: Verify instructions work on a clean install

## Example Format

```markdown
# v1.2.0 - Enhanced Agent Performance 🚀

Released: 2025-01-15

## 🎯 Highlights

This release significantly improves agent execution performance and adds multi-arch container support.

## 💥 Breaking Changes

**⚠️ Action Required**:
- Configuration format for `modelConfig` has changed. See [migration guide](#migration).

## 🚀 New Features

- Multi-arch containers (amd64 + arm64) for better performance
- Automated dependency updates via Renovate
- Comprehensive security scanning with Trivy

[See full notes]
```
