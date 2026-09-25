"""Query parameter description constants for API endpoints."""

NAMESPACE_DESCRIPTION = "Namespace for this request (defaults to current context)"

LABEL_SELECTOR_DESCRIPTION = "Label selector for filtering resources (e.g., app.kubernetes.io/instance=phoenix)"

VIEW_DESCRIPTION = "Response detail level: 'full' (default) returns every field; 'summary' omits heavy fields (prompt, non-essential annotations) for list rendering"
