# url-param-scoping Specification

## Purpose

Defines which URL query parameters survive navigation in the dashboard, and guarantees the active namespace is always present in the URL so it survives refresh, direct navigation, and link sharing.

## Requirements

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

Any query parameter that is not app-scoped SHALL be removed from the URL when a navigation changes which screen is displayed, unless the navigation is a return to a screen the user has already visited (see "Returning to a screen restores the state it was left in").

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

#### Scenario: A link supplies a different namespace

- **WHEN** the user follows a link whose target names a namespace other than the active one
- **THEN** the destination keeps the namespace the link supplied, and the namespace left behind is not restored

### Requirement: Returning to a screen restores the state it was left in

The dashboard SHALL record the URL of each list screen the user visits since the page was loaded. A return control - a detail page's breadcrumb, a studio or form's back or cancel action, or closing Settings - SHALL restore that screen's own parameters - filters, sorting and pagination - so the user does not have to reapply them. The recorded URL SHALL NOT carry app-scoped parameters, so the namespace in use at the time of the return is the one applied.

Sidebar entries are not return controls and SHALL open a screen with no parameters applied, so the sidebar remains a way to reach a screen in its default state. This is uniform across the sidebar: no entry restores, and none may special-case a single screen.

#### Scenario: A breadcrumb returns to the list as it was left

- **WHEN** the user filters a list, opens one of its rows, and returns using the detail page's breadcrumb
- **THEN** the list is displayed with the same filters, sorting and page as when the row was opened

#### Scenario: Closing Settings returns to the screen state it was entered from

- **WHEN** the user filters a screen, opens Settings, and closes Settings
- **THEN** that screen is displayed again with the same filters, sorting and page

#### Scenario: A detail page reached directly returns to the unfiltered list

- **WHEN** the user opens a detail page URL directly, without having visited its list since the page was loaded, and follows the breadcrumb
- **THEN** the list is displayed with no filters applied, and no parameters are invented

#### Scenario: A restored screen uses the current namespace

- **WHEN** the user returns to a screen that was last visited under a different namespace
- **THEN** the screen's own parameters are restored and the namespace currently in use is applied, not the one recorded earlier

#### Scenario: A sidebar entry opens the screen in its default state

- **WHEN** the user filters a list, navigates away, and returns to it from the sidebar
- **THEN** the list is displayed with no filters applied, and the same holds for every sidebar entry

#### Scenario: Browser history is unaffected by filter changes

- **WHEN** the user changes filters, sorting or pagination on a screen and then presses the browser back button
- **THEN** they return to the screen they visited before that one, rather than stepping back through each filter change

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

#### Scenario: Namespace synchronisation preserves the configured base path

- **WHEN** the dashboard is deployed under a non-empty base path and the resolved namespace is written into the URL
- **THEN** the resulting URL keeps the base path prefix, so a refresh or a copy of that URL reaches the same deployment

### Requirement: An unreachable namespace is corrected in the URL

When the namespace requested in the URL cannot be used, the dashboard SHALL notify the user and SHALL replace it in the URL with the namespace actually in use, so the URL never disagrees with what is displayed.

#### Scenario: Requested namespace is not accessible

- **WHEN** the user opens a URL naming a namespace they cannot access
- **THEN** the dashboard reports that the namespace is unavailable, uses the fallback namespace, and the URL shows the fallback

#### Scenario: Correcting an unreachable namespace preserves the configured base path

- **WHEN** the dashboard is deployed under a non-empty base path and an unreachable namespace is replaced with the fallback in the URL
- **THEN** the corrected URL keeps the base path prefix

### Requirement: Namespace synchronisation does not disrupt browser history

Adding or correcting the namespace in the URL SHALL NOT create a browser history entry, and SHALL NOT repeat once the URL already names the active namespace.

#### Scenario: Back button is unaffected by namespace synchronisation

- **WHEN** the user opens a dashboard URL without a namespace parameter and then presses the browser back button
- **THEN** they return to the page they came from, not to the same screen without its namespace

#### Scenario: Synchronisation settles

- **WHEN** the URL already names the active namespace
- **THEN** no further URL update is performed

### Requirement: Namespace synchronisation does not interrupt the screen

Writing the active namespace into the URL SHALL NOT return the dashboard to its loading state, whether the namespace was added because the URL named none or substituted because the URL named an unreachable one.

#### Scenario: Adding the namespace does not re-show the loading screen

- **WHEN** the user opens a dashboard URL with no namespace parameter
- **THEN** the dashboard passes through its loading state once, and stays on screen while the namespace is written into the URL

#### Scenario: Correcting an unreachable namespace does not re-show the loading screen

- **WHEN** an unreachable namespace is replaced with the fallback in the URL
- **THEN** the dashboard stays on screen, and the substitution is reported once

#### Scenario: A namespace being loaded is not displayed as active

- **WHEN** the user navigates to a URL naming a namespace whose context has not loaded yet
- **THEN** the dashboard does not present the previous namespace's resources as belonging to the requested one
