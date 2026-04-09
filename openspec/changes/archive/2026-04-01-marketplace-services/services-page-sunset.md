# Services Page Sunset

## Overview

The Ark Dashboard's **Services** page has been removed and its functionality absorbed by the **Marketplace** page. This change provides a more unified and reliable way to access marketplace item UIs.

## What Was Removed

### Services Page (`/services`)
- Dedicated page listing Ark services with UI access
- Navigation entry in sidebar
- Settings modal "Ark Services" tab
- Components: `ark-services-table.tsx`, `use-ark-services.ts`, `ark-services-settings.tsx`

### Removed Components
```
services/ark-dashboard/ark-dashboard/app/(dashboard)/services/page.tsx
services/ark-dashboard/ark-dashboard/components/ark-services/ark-services-table.tsx
services/ark-dashboard/ark-dashboard/components/ark-services/use-ark-services.ts
services/ark-dashboard/ark-dashboard/components/settings-modal/ark-services-settings.tsx
```

## What Replaced It

### Marketplace Page with UI URLs

The marketplace page now:
1. **Shows installation status** - Items marked "Installed" when detected via Helm
2. **Displays UI access buttons** - "Open" buttons for items with web UIs
3. **Supports filtering** - "Installed" filter to show only deployed items
4. **Works across networking setups** - No assumptions about port-forwarding or nip.io

### New Capabilities

**Installation Detection:**
- Queries Helm releases via `/v1/marketplace-items` endpoint
- Matches by chart annotation (`ark.mckinsey.com/marketplace-item-name`)
- Works regardless of release name chosen by user

**UI URL Discovery:**
- Service annotations carry UI URLs (`ark.mckinsey.com/marketplace-item-ui-url`)
- Optional display labels (`ark.mckinsey.com/marketplace-item-ui-label`)
- Multiple UI buttons for items with multiple services
- Network-agnostic (Ingress, Gateway API, LoadBalancer, port-forward)

## Migration Guide for Users

### Before (Services Page)

Users accessed marketplace item UIs via the Services page:
```
Dashboard → Services → Click service → Open UI
```

The services page made assumptions about:
- Port-forwarding availability
- nip.io domain routing
- Specific networking configuration

### After (Marketplace Page)

Users access UIs directly from the marketplace:
```
Dashboard → Marketplace → [Item shows "Installed" badge] → Click "Open" button
```

**Improved experience:**
- ✅ Installation status clearly visible
- ✅ UI buttons only appear when URLs are configured
- ✅ Works with any networking setup (admin configures URL at install time)
- ✅ Unified view of all marketplace items (installed and available)

## For Administrators

### Installing Marketplace Items with UI URLs

When installing marketplace items with web UIs, set the UI URL at install time:

**Direct Service Pattern (e.g., A2A Inspector):**
```bash
helm install a2a-inspector ./chart \
  --set uiUrl=https://a2a-inspector.example.com \
  --set uiLabel="A2A Inspector"
```

**Wrapper Chart Pattern (e.g., Phoenix):**
```bash
helm install phoenix ./chart \
  --set 'phoenix-helm.service.annotations.ark\.mckinsey\.com/marketplace-item-ui-url'=https://phoenix.example.com \
  --set 'phoenix-helm.service.annotations.ark\.mckinsey\.com/marketplace-item-ui-label'="Phoenix Dashboard"
```

See the [Marketplace Setup Guide](https://mckinsey.github.io/agents-at-scale-marketplace/marketplace-setup) for complete configuration details.

### Updating Existing Deployments

To add UI URLs to already-deployed marketplace items:

```bash
# Get current values
helm get values <release-name> -n <namespace> > current-values.yaml

# Add UI URL configuration
# (Edit current-values.yaml to add uiUrl and uiLabel or service annotations)

# Upgrade release
helm upgrade <release-name> ./chart -n <namespace> -f current-values.yaml
```

The dashboard will automatically detect the new UI URLs on the next page load.

## Technical Implementation

### Dashboard Changes

**Removed:**
- `/services` route and page component
- Services navigation entry
- Ark Services settings tab
- Service-specific API calls and components

**Added:**
- "Installed" filter to marketplace page
- UI button rendering on marketplace cards
- Service annotation querying via `/v1/resources`
- Installation detection via `/v1/marketplace-items`

### API Changes

**New endpoint:**
- `GET /v1/marketplace-items` - Queries Helm releases in current namespace

**Enhanced endpoint:**
- `GET /v1/resources/v1/Service?labelSelector=...` - Added `labelSelector` parameter

**Preserved endpoint:**
- `GET /v1/ark-services` - Kept for potential other consumers (not used by dashboard)

## References

- [Marketplace Setup Guide](https://mckinsey.github.io/agents-at-scale-marketplace/marketplace-setup)
- [OpenSpec Proposal](./proposal.md)
- [OpenSpec Design](./design.md)
- [Implementation Tasks](./tasks.md)
- [PR #1767](https://github.com/mckinsey/agents-at-scale-ark/pull/1767)
