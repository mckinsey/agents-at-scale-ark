## ADDED Requirements

### Requirement: Install a marketplace item containing only Ark resources into a namespace

ark-api SHALL install a marketplace item into a target namespace when both conditions hold: every object the item's chart renders is an allowlisted namespaced Ark configuration resource, and the requesting user may create those resources in that namespace. The dashboard SHALL offer the install action without requiring a terminal.

#### Scenario: Ark-only item installs from the dashboard

- **WHEN** an authorized user triggers install for an item whose chart renders only allowlisted Ark resources
- **THEN** ark-api installs it into the selected namespace and the created resources appear there

#### Scenario: Installed item is reflected in the catalogue

- **WHEN** an install succeeds
- **THEN** the item shows as installed in the marketplace grid, resolved from the Helm release as it is for every other installed item

#### Scenario: Install target is the namespace the user is working in

- **WHEN** a user installs an item while the dashboard is scoped to a namespace
- **THEN** the resources are created in that namespace, ignoring any namespace the item declares in its catalogue metadata

### Requirement: Decide installability by rendering the chart

ark-api SHALL decide installability by rendering the item's chart and checking every object it would create. Catalogue metadata, including the item `type` and any self-declared flag, SHALL NOT be used. Rendering SHALL NOT contact the cluster.

#### Scenario: Item catalogued as an agent but containing workloads is refused

- **WHEN** an item declared as `type: agent` renders a `Deployment`, a `Service` and RBAC objects alongside an `Agent`
- **THEN** it is reported as not installable, and none of its objects are created

#### Scenario: Item catalogued identically but containing only an Agent is accepted

- **WHEN** an item declared as `type: agent` renders exactly one `Agent`
- **THEN** it is reported as installable

### Requirement: Restrict installable content to allowlisted namespaced Ark configuration kinds

Every object in the rendered manifest SHALL satisfy all four rules below. An object failing any of them SHALL make the item not installable.

1. **Kind** — the object SHALL be one of `Agent`, `Team`, `Model`, `Tool`, `MCPServer`, `A2AServer`, `Memory`, `ExecutionEngine`.
2. **Scope** — the object SHALL be namespaced, with scope determined through API discovery rather than a hardcoded list.
3. **Namespace** — the object SHALL NOT declare a `metadata.namespace` other than the install target.
4. **Hooks** — the object SHALL NOT carry a Helm hook annotation.

#### Scenario: Cluster-scoped Ark resource is rejected

- **WHEN** an item renders an `ArkConfig`, which is cluster-scoped
- **THEN** the item is reported as not installable, even though the object belongs to the `ark.mckinsey.com` group

#### Scenario: Execution-triggering resources are rejected

- **WHEN** an item renders a `Query` or an `A2ATask`
- **THEN** the item is reported as not installable, so installing configuration never dispatches model calls

#### Scenario: RBAC object makes an item non-installable

- **WHEN** an item renders a `RoleBinding`, a `Role` or a `ServiceAccount`
- **THEN** the item is reported as not installable, so the UI cannot grant permissions

#### Scenario: ConfigMap or Secret makes an item non-installable

- **WHEN** an item renders a `ConfigMap` or a `Secret`
- **THEN** the item is reported as not installable and the command-only path is offered

#### Scenario: Object targeting another namespace is rejected

- **WHEN** a rendered object declares a `metadata.namespace` different from the install target
- **THEN** the item is reported as not installable and nothing is created

#### Scenario: Helm hook is rejected

- **WHEN** a rendered object carries a `helm.sh/hook` annotation
- **THEN** the item is reported as not installable, so a pre-install Job cannot enter as a hook

#### Scenario: Mixed content installs nothing

- **WHEN** an item renders four allowlisted Ark resources and one disallowed object
- **THEN** no object is created — rejection is all-or-nothing

### Requirement: Constrain chart inputs that can change rendered content

ark-api SHALL classify each install argument carried in catalogue metadata into one of three groups, by enumeration rather than by category:

- **Accepted** — arguments that set inline literal values, currently `--set` and `--set-string`. These are used for the render and the install.
- **Ignored** — arguments that are irrelevant to installing into an existing namespace, currently `--create-namespace`. These are dropped, and their presence SHALL NOT make an item not installable.
- **Refused** — every other argument, including any that names a file path or URL. An item carrying one SHALL be reported as not installable.

ark-api SHALL NOT create a namespace. ark-api SHALL bound the size and object count of a rendered manifest.

#### Scenario: The catalogue's namespace-creation flag does not block installation

- **WHEN** an item's metadata carries `--create-namespace`, as every catalogue item currently does
- **THEN** the argument is ignored and installability is decided on the item's content, and no namespace is created

#### Scenario: Argument reading from the ark-api pod is refused

- **WHEN** an item's metadata carries an argument that sets a value from a file path, such as `--set-file`
- **THEN** the item is reported as not installable, so chart values cannot be populated from ark-api's own filesystem

#### Scenario: Argument fetching remote content is refused

- **WHEN** an item's metadata carries a values argument pointing at a URL
- **THEN** the item is reported as not installable, so rendered content cannot come from a source outside the pinned chart

#### Scenario: Argument that rewrites rendered output is refused

- **WHEN** an item's catalogue metadata carries an argument such as a post-renderer
- **THEN** the item is reported as not installable rather than rendered with that argument

#### Scenario: Oversized manifest is refused

- **WHEN** a chart renders more objects, or a larger manifest, than the configured bound
- **THEN** the item is reported as not installable and no install is attempted

### Requirement: Verify ark-api's own write access to the target namespace

ark-api SHALL determine whether it can itself create the rendered resource types in the target namespace, and SHALL report the result as part of installability. This check SHALL be evaluated against ark-api's own Service Account, without impersonation, and SHALL be distinct from the review of the requesting user. Where ark-api cannot write, it SHALL NOT attempt the install.

#### Scenario: Namespace without a binding is reported before any install

- **WHEN** installability is requested for a namespace where no binding grants ark-api write access
- **THEN** the response reports that ark-api cannot install there, naming the namespace, without a Helm install being attempted

### Requirement: Roll back a failed install

ark-api SHALL install atomically, with a bounded timeout, so that an install which fails partway leaves no resources behind.

#### Scenario: Failure partway leaves nothing

- **WHEN** an install fails after some of the item's resources have been created
- **THEN** the created resources are removed, and the namespace is left as it was before the attempt

### Requirement: Refuse an item that is already installed

Where installing would collide with an existing Helm release in the target namespace, ark-api SHALL report this as an expected outcome naming the existing release, and SHALL NOT install, modify or replace it.

#### Scenario: Re-installing an installed item is refused

- **WHEN** a user triggers install for an item already installed in the target namespace
- **THEN** the dialog reports that it is already installed, and the existing resources are left untouched

### Requirement: Validate and install the same chart revision

ark-api SHALL pin the chart to an immutable digest, resolve that digest when installability is evaluated, and install from that same digest. Validation SHALL run again inside the install request, immediately before installing.

#### Scenario: Chart republished between preview and install

- **WHEN** an item's chart is republished under the same tag after installability was reported and before install is triggered
- **THEN** the install either proceeds from the previously validated digest or fails, and never installs content that was not validated in the same request

#### Scenario: Install called without a preview

- **WHEN** a client calls install directly, having never requested installability
- **THEN** content validation and authorization apply identically, with no weaker outcome

### Requirement: Refuse charts whose rendered output depends on cluster state

ark-api SHALL refuse an item whose chart can render differently during install than it did during validation. A chart whose templates invoke Helm's `lookup` function SHALL be reported as not installable, because validation renders without cluster access while install renders with it.

#### Scenario: Chart reading cluster state is refused

- **WHEN** an item's chart templates invoke `lookup`
- **THEN** the item is reported as not installable, even if the manifest it renders during validation contains only allowlisted Ark resources

### Requirement: Authorize the requesting user, not the service account

Wherever a user identity is available, ark-api SHALL authorize the install against that identity, for the `create` verb on every distinct resource type in the rendered manifest, in the target namespace. All reviews SHALL pass for the install to proceed. ark-api SHALL NOT evaluate its own Service Account and present the result as a user authorization.

#### Scenario: Read-only user is refused

- **WHEN** a user who cannot create Ark resources in a namespace triggers install of an installable item there
- **THEN** the request is refused and nothing is created — the Service Account's privilege is not lent to the user

#### Scenario: Partial permission is refused

- **WHEN** an item renders an `Agent` and a `Model`, and the user may create `Agent` but not `Model`
- **THEN** the request is refused and nothing is created

#### Scenario: Authorization holds with impersonation enabled

- **WHEN** impersonation is enabled and a JWT-authenticated user triggers install
- **THEN** the review is evaluated as that user, through the impersonating client, and asking requires no extra privilege

#### Scenario: Authorization holds with impersonation disabled

- **WHEN** impersonation is disabled and a JWT-authenticated user triggers install
- **THEN** the review is still evaluated against that user's identity, carried as a parameter rather than taken from the calling credentials

### Requirement: Install without restriction where the deployment performs no authentication

Where ark-api performs no authentication, no identity exists to authorize. It SHALL treat the install as unrestricted rather than refusing it, matching every other Ark resource write it already accepts in that mode.

#### Scenario: Local development can install

- **WHEN** authentication is disabled and a user triggers install of an installable item
- **THEN** the install proceeds, on the same footing as creating an Agent through the dashboard form in that mode

#### Scenario: Authenticated deployment missing the identity claim does not install

- **WHEN** authentication is enabled but the configured identity claim is absent, so no identity can be determined
- **THEN** the item is reported as not installable for that session and the dialog shows the command

### Requirement: Report both positive and negative outcomes to the dashboard

The installability response SHALL report the item verdict, the user verdict and the namespace verdict separately, each with a reason when negative, so the dashboard can tell an item that can never be installed from a user who may not install it here, and both from a namespace where ark-api cannot install at all.

#### Scenario: Non-Ark item shows the blocking content

- **WHEN** an item is not installable because of its content
- **THEN** the response names the disallowed kinds, and the dialog shows the command plus a note that non-Ark resources are installed by the user or platform team

#### Scenario: Unauthorized user sees a permission message

- **WHEN** an item is installable but the user is not authorized in that namespace
- **THEN** the dialog shows the command plus a note that the user lacks permission to install in that namespace, worded differently from the content refusal

#### Scenario: Namespace where ark-api cannot write

- **WHEN** ark-api has no binding permitting writes in the target namespace
- **THEN** the outcome is reported as an expected permission result naming the namespace, not as an unexpected failure

#### Scenario: Chart cannot be resolved

- **WHEN** an item's chart cannot be fetched from its registry
- **THEN** the response reports an item-level resolution error, distinct from a validation refusal, and no install is attempted

### Requirement: Offer the install action on every catalogue item

The dashboard SHALL show an install action for every marketplace item. The dialog SHALL always show the installation commands, and SHALL add an install-to-namespace action only when the item is installable and the user is authorized.

Installability SHALL be requested when a dialog opens, at most once per opening. The dashboard SHALL NOT request it while rendering the grid, so that opening the marketplace costs no chart fetches regardless of how many items the catalogue holds.

Because installability requires fetching a chart over the network, the dialog SHALL render the commands immediately from catalogue metadata, without waiting, and SHALL resolve the install action separately once the verdicts arrive. The dialog SHALL indicate that installability is still being determined, and SHALL remain usable if it cannot be determined.

#### Scenario: Every item exposes the action

- **WHEN** a user views the marketplace grid
- **THEN** every item offers an install action, whichever outcome its dialog will show

#### Scenario: Opening the grid fetches no charts

- **WHEN** a user opens a marketplace grid of any size, for example one hundred items
- **THEN** no installability request is issued for any item, and no chart is fetched from a registry

#### Scenario: Commands appear before installability is known

- **WHEN** a user opens the dialog for an item and the installability request is still in flight
- **THEN** the commands are already shown, the dialog indicates that installability is being determined, and the install action appears only once the verdicts arrive

#### Scenario: Installability cannot be determined

- **WHEN** the installability request fails or does not complete
- **THEN** the dialog stays usable with the commands and reports that installability is unknown, rather than blocking or appearing broken

#### Scenario: Install progress and result are visible

- **WHEN** a user triggers an install
- **THEN** the dialog shows that the install is running, then reports success or the reason for failure, without the user leaving the dashboard

### Requirement: The dashboard never executes Helm

The dashboard SHALL NOT spawn a Helm process. ark-api performs installs. The dashboard calls ark-api and renders the outcome.

#### Scenario: No Helm execution in the dashboard pod

- **WHEN** any marketplace install path runs
- **THEN** no Helm process is spawned in the dashboard pod

### Requirement: Add no privilege beyond asking about permissions

This capability SHALL add exactly one permission to ark-api: creating `SubjectAccessReview` objects. It SHALL NOT widen ark-api's existing resource permissions, and SHALL NOT grant permission in namespaces where ark-api has no binding.

#### Scenario: No new write permission

- **WHEN** the capability is deployed
- **THEN** ark-api's permissions to create, update or delete resources are unchanged

### Requirement: Record who installed what

ark-api SHALL log one structured record per install attempt with the user identity, target namespace, item identifier, resolved chart digest and rendered kinds. It SHALL NOT log chart values or credentials.

#### Scenario: Install is attributable

- **WHEN** an install is attempted, successfully or not
- **THEN** a log record identifies the user, the namespace, the item, the chart digest and the outcome

#### Scenario: No sensitive values in logs

- **WHEN** an install is attempted
- **THEN** no credential or chart value appears in any log record
