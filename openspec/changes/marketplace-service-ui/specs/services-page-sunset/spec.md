## ADDED Requirements

### Requirement: Marketplace page has Installed filter
The marketplace page SHALL provide a way to filter items by installation status, showing only installed items.

#### Scenario: User views installed items
- **WHEN** a user selects the "Installed" filter on the marketplace page
- **THEN** only items with `status: "installed"` SHALL be displayed

#### Scenario: Installed view shows UI links
- **WHEN** viewing installed items that have a `uiUrl`
- **THEN** each item SHALL show an "Open" button alongside its installed status

### Requirement: Services page removed from navigation
The services page SHALL be removed from the dashboard sidebar navigation.

#### Scenario: Services page not in nav
- **WHEN** a user views the dashboard sidebar
- **THEN** there SHALL be no "Services" navigation entry

### Requirement: Services page route redirects to marketplace
The `/services` route SHALL redirect to `/marketplace` with the installed filter active.

#### Scenario: Direct navigation to services URL
- **WHEN** a user navigates to `/services`
- **THEN** they SHALL be redirected to the marketplace page filtered to installed items

### Requirement: Services page code removed
The services page component, ark-services table, use-ark-services hook, and ark-services API service SHALL be removed from the dashboard codebase.

#### Scenario: No services page code remains
- **WHEN** the services page sunset is complete
- **THEN** the following files SHALL no longer exist: `app/(dashboard)/services/page.tsx`, `components/ark-services/`, `lib/services/ark-services.ts`
