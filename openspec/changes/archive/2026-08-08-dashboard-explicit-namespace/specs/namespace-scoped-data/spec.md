## Purpose

Defines how the active namespace identifies the dashboard's fetched and cached data, so resources belonging to one namespace are never displayed, requested, or stored for another.

## ADDED Requirements

### Requirement: Displayed resources belong to the active namespace

The dashboard SHALL display only resources belonging to the namespace currently active. Data retrieved while one namespace was active SHALL NOT be displayed once a different namespace is active.

#### Scenario: Switching namespace replaces the displayed resources

- **WHEN** the user is viewing a resource list in one namespace and the active namespace changes to another
- **THEN** the list shows the second namespace's resources, and none of the first namespace's resources are shown at any point

#### Scenario: Returning to a previously viewed namespace

- **WHEN** the user views a namespace, moves to a second namespace, and then returns to the first
- **THEN** the resources shown belong to the first namespace

#### Scenario: An empty namespace displays as empty

- **WHEN** the active namespace changes to one that contains no resources of the displayed type
- **THEN** the screen shows an empty state rather than the previous namespace's resources

#### Scenario: A list retrieved across several pages

- **WHEN** a resource list is large enough that the dashboard retrieves it in more than one page
- **THEN** every page is retrieved for the active namespace, so no page of the list belongs to another namespace

### Requirement: Requests are deferred until the active namespace is resolved

The dashboard SHALL NOT request namespaced resources before the active namespace is known. No request SHALL be issued for a placeholder or assumed namespace.

#### Scenario: Initial load without a namespace in the URL

- **WHEN** the user opens a dashboard screen whose URL names no namespace
- **THEN** no namespaced resource request is issued until the active namespace has been resolved

#### Scenario: Namespace resolution fails

- **WHEN** the active namespace cannot be resolved
- **THEN** no namespaced resource request is issued for a substituted namespace without the user being informed which namespace is in use

### Requirement: A response is attributed to the namespace it was requested for

A response SHALL be retained only for the namespace whose request produced it, including when the active namespace changes while a request is in flight.

#### Scenario: Namespace changes before a response arrives

- **WHEN** a resource request is in flight and the active namespace changes before the response arrives
- **THEN** the response is not displayed as the new namespace's data, and is not retained for the new namespace

### Requirement: Changing a resource refreshes its namespace's data

After a resource is created, updated, or deleted, the dashboard SHALL refresh the affected data for the namespace the change was made in.

#### Scenario: Creating a resource updates the list

- **WHEN** the user creates a resource in the active namespace
- **THEN** the list for that namespace includes the new resource without a manual reload

#### Scenario: Deleting a resource updates the list

- **WHEN** the user deletes a resource in the active namespace
- **THEN** the list for that namespace no longer includes it without a manual reload
