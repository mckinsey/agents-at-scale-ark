# API Key Management - Frontend Implementation Plan

## Overview

This document outlines the implementation plan for adding API key management capabilities to the ARK Dashboard. The implementation will follow existing ARK Dashboard patterns and architecture for consistency and maintainability.

## Current State Analysis

### ✅ Existing Architecture Patterns Found:

1. **DataTable Implementation**: ARK uses TanStack Table (React Table) with shadcn/ui components
2. **Navigation Structure**: Collapsible sidebar groups (Configurations, Operations, Runtime)
3. **API Services**: Consistent pattern using `lib/services/` with APIClient
4. **UI Components**: Row/Card dual view pattern, confirmation dialogs, tooltips
5. **Routing**: Next.js App Router with `(dashboard)` layout

### 📍 Reference Implementations:
- **DataTable**: `app/(dashboard)/services/page.tsx` - TanStack Table implementation
- **API Service**: `lib/services/mcp-servers.ts` - CRUD operations pattern
- **Delete Confirmation**: `components/dialogs/confirmation-dialog.tsx`
- **Navigation**: `lib/constants/dashboard-icons.ts` - menu structure

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 API Service Layer
**File**: `lib/services/api-keys.ts`

```typescript
// Service interface matching backend API
export interface APIKey {
  id: string;
  name: string;
  public_key: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export interface APIKeyCreateRequest {
  name: string;
  expires_at?: string;
}

export interface APIKeyCreateResponse extends APIKey {
  secret_key: string; // Only shown once
}

export const apiKeysService = {
  async getAll(): Promise<{ items: APIKey[]; count: number }>,
  async create(request: APIKeyCreateRequest): Promise<APIKeyCreateResponse>,
  async delete(publicKey: string): Promise<void>
};
```

#### 1.2 Navigation Menu Addition
**File**: `lib/constants/dashboard-icons.ts`

Add new menu item as top-level group (same level as Runtime):
```typescript
apiKeys: {
  key: "api-keys",
  title: "Service API Keys", 
  icon: Key, // From lucide-react
  group: "service" // New top-level group
}
```

**Update required in**: `components/app-sidebar.tsx` to include new section

### Phase 2: Page Structure

#### 2.1 Main Page Implementation
**File**: `app/(dashboard)/api-keys/page.tsx`

**Architecture**: Follow existing pattern from `services/page.tsx`
- Breadcrumb navigation
- Main content with DataTable
- Add button with primary action styling
- Loading and error states

#### 2.2 DataTable Component
**Pattern**: Reuse TanStack Table architecture from services page

**Columns**:
- **Name**: API key display name (string)
- **Public Key**: `pk-ark-...` (string, truncated with copy button)
- **Created**: Formatted date/time (ISO string → readable format)
- **Last Used**: Formatted date/time or "Never" (nullable)
- **Expires**: Formatted date/time or "Never" (nullable) 
- **Actions**: Revoke button (delete operation)

**Note**: Status badges not needed initially since backend only returns active keys

**Features**:
- Copy public key to clipboard functionality
- Standard date/time display (ISO format)
- Confirmation dialog for revoke action

### Phase 3: Add API Key Feature

#### 3.1 Add API Key Dialog
**File**: `components/dialogs/add-api-key-dialog.tsx`

**Form Fields**:
- **Name**: Required text input (user-friendly identifier)
- **Expires At**: Optional datetime picker (or "Never" option)

**Validation**:
- Name: Required, 1-255 characters, no special restrictions
- Expires At: Must be future date if provided

#### 3.2 Success Display Dialog
**File**: `components/dialogs/api-key-created-dialog.tsx`

**Content**:
- ✅ Success message
- 🔑 **Public Key**: `pk-ark-...` (copyable)
- 🔐 **Secret Key**: `sk-ark-...` (copyable)
- ⚠️ **Warning Panel**: "This secret key will only be shown once. Save it securely."
- **Copy Both** button for easy credential copying
- **Done** button to close dialog

**Security Features**:
- Clear text input protection
- Prominent security warning

### Phase 4: Delete/Revoke Feature

#### 4.1 Revoke Confirmation
**Pattern**: Use existing `components/dialogs/confirmation-dialog.tsx`

**Dialog Content**:
- Title: "Revoke API Key"
- Description: "Revoke API key '{name}' ({public_key})? This action cannot be undone and will immediately invalidate the key."
- Confirm: "Revoke" (destructive variant)
- Cancel: "Cancel"

#### 4.2 Soft Delete Implementation
- Backend performs soft delete (marks as inactive)
- Frontend removes deleted keys from list immediately
- Backend only returns active keys in list endpoint

### Phase 5: UI/UX Enhancements

#### 5.1 Table Features
- **Empty State**: When no API keys exist
- **Copy Buttons**: One-click copy for public keys
- **Standard Date Display**: ISO format dates
- **Tooltips**: Helpful hints throughout interface

#### 5.2 Error Handling
- **Validation errors**: Clear field-level error messages
- **API errors**: User-friendly error descriptions
- **Basic error feedback**: Using existing error patterns

## Technical Implementation Details

### File Structure
```
app/(dashboard)/api-keys/
├── page.tsx                    # Main page component
components/dialogs/
├── add-api-key-dialog.tsx      # Create API key form
├── api-key-created-dialog.tsx  # Show created key once
lib/services/
├── api-keys.ts                 # API service layer
components/ui/
├── copy-button.tsx             # Copy to clipboard utility
```

### API Endpoints Used
- `GET /v1/api-keys` - List all API keys
- `POST /v1/api-keys` - Create new API key
- `DELETE /v1/api-keys/{public_key}` - Revoke API key

### Dependencies Required
- **Existing**: All required dependencies already in project
- **Copy to Clipboard**: Browser API (`navigator.clipboard`)

## Questions for Clarification

### 1. Navigation Placement ✅ ANSWERED
- ✅ **Decision**: Add as top-level menu item (same level as Runtime group)
- **Implementation**: Create new "Service" group for API key management

### 2. View Options ✅ ANSWERED
- ✅ **Decision**: Table view only
- **Implementation**: Single DataTable component without view toggle

### 3. Search and Filtering ✅ ANSWERED
- ✅ **Decision**: No search or filtering needed
- **Implementation**: Simple table display without filter controls

### 4. User Attribution ✅ ANSWERED
- ✅ **Decision**: No user scoping preparation needed
- **Implementation**: Simple global API key management interface

### 5. Pagination ✅ ANSWERED
- ✅ **Decision**: Client-side pagination is fine
- **Implementation**: Simple table without pagination (few keys expected)

### 6. Additional Features ✅ ANSWERED
- ✅ **Decision**: No additional features needed initially
- **Implementation**: Basic CRUD operations only

## Success Criteria

### ✅ Functional Requirements
- [ ] Users can view all API keys in a table
- [ ] Users can create new API keys with name and optional expiration
- [ ] Users can revoke (soft delete) API keys with confirmation
- [ ] Secret key is shown exactly once upon creation
- [ ] Public keys can be easily copied to clipboard
- [ ] Simple table display (status not needed since only active keys shown)

### ✅ Non-Functional Requirements
- [ ] Consistent with existing ARK Dashboard UI/UX patterns
- [ ] Responsive design works on mobile and desktop
- [ ] Proper error handling and user feedback
- [ ] Secure handling of sensitive data (secret keys)
- [ ] Accessibility compliance (keyboard navigation, screen readers)

### ✅ Integration Requirements
- [ ] Seamless integration with existing navigation
- [ ] Uses established API patterns and error handling
- [ ] Follows ARK Dashboard coding standards and conventions
- [ ] No breaking changes to existing functionality

**Note**: This plan leverages existing ARK Dashboard patterns extensively to ensure consistency and reduce development time. The implementation will feel native to ARK users and maintain the established design language.
