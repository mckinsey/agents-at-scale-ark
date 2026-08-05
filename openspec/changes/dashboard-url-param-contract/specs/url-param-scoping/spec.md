## Purpose

Defines which URL query parameters survive navigation in the dashboard, and guarantees the active namespace is always present in the URL so it survives refresh, direct navigation, and link sharing.

## ADDED Requirements

### Requirement: App-scoped parameters survive navigation

The dashboard SHALL classify `namespace` as an app-scoped parameter and SHALL preserve it across every in-app navigation, regardless of which control the user navigates with.

#### Scenario: Sidebar navigation preserves the namespace

- **WHEN** the user is viewing a screen with an active namespace and clicks a sidebar entry
- **THEN** the destination URL carries the same namespace

#### Scenario: Breadcrumb and cancel links preserve the namespace

- **WHEN** the user leaves a screen via a breadcrumb, a back link, or a form's cancel action
- **THEN** the destination URL carries the same namespace

#### Scenario: Starting a new session preserves the namespace

- **WHEN** the user creates a new session from a session conversation
- **THEN** the destination URL carries the same namespace

### Requirement: Page-local parameters are dropped when leaving a screen

Any query parameter that is not app-scoped SHALL be removed from the URL when a navigation changes which screen is displayed.

#### Scenario: A form prefill parameter does not follow the user

- **WHEN** the user opens the new-model form via a link that prefills the model name, and then navigates to any other screen
- **THEN** the prefill parameter is absent from the destination URL

#### Scenario: Session-creation parameters do not follow the user

- **WHEN** the user arrives at a session screen with session-creation parameters and then navigates to a different screen
- **THEN** those parameters are absent from the destination URL

### Requirement: A destination may request parameters explicitly

Parameters named by a navigation target SHALL be applied to the destination URL and SHALL take precedence over any parameter of the same name carried from the current screen.

#### Scenario: A link supplies its own parameter

- **WHEN** the user follows a link that names a parameter in its target
- **THEN** the destination URL contains that parameter with the value the link supplied

### Requirement: Screen-owned parameters survive navigation within the same screen

Navigation that does not change which screen is displayed SHALL preserve all current query parameters, so a screen can hold its own state — filters, sorting, pagination — in the URL.

#### Scenario: Changing a filter keeps the screen's other parameters

- **WHEN** the user changes one filter on a screen that holds several filter parameters in the URL
- **THEN** the other parameters are still present after the update

#### Scenario: Screen-owned parameters survive a refresh

- **WHEN** the user refreshes a screen whose filters are held in the URL
- **THEN** the same filters are applied after the reload

### Requirement: The active namespace is present in the URL

Once the active namespace has been resolved, the URL SHALL contain it. This applies whether the namespace came from the URL itself or was resolved because the URL did not specify one.

#### Scenario: Direct navigation without a namespace parameter

- **WHEN** the user opens a dashboard URL that has no namespace parameter
- **THEN** the resolved namespace is added to the URL

#### Scenario: Refresh preserves the active namespace

- **WHEN** the user refreshes any dashboard screen
- **THEN** the same namespace is active after the reload, and resources are not requested from a different namespace

#### Scenario: A shared link reproduces the sender's namespace

- **WHEN** a user copies the current URL and another user with the same access opens it
- **THEN** the second user sees the same namespace as the first

### Requirement: An unreachable namespace is corrected in the URL

When the namespace requested in the URL cannot be used, the dashboard SHALL notify the user and SHALL replace it in the URL with the namespace actually in use, so the URL never disagrees with what is displayed.

#### Scenario: Requested namespace is not accessible

- **WHEN** the user opens a URL naming a namespace they cannot access
- **THEN** the dashboard reports that the namespace is unavailable, uses the fallback namespace, and the URL shows the fallback

### Requirement: Namespace synchronisation does not disrupt browser history

Adding or correcting the namespace in the URL SHALL NOT create a browser history entry, and SHALL NOT repeat once the URL already names the active namespace.

#### Scenario: Back button is unaffected by namespace synchronisation

- **WHEN** the user opens a dashboard URL without a namespace parameter and then presses the browser back button
- **THEN** they return to the page they came from, not to the same screen without its namespace

#### Scenario: Synchronisation settles

- **WHEN** the URL already names the active namespace
- **THEN** no further URL update is performed
