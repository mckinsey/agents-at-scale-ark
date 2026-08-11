// ARK label prefix - mirrors ark/internal/labels/labels.go
const ARK_PREFIX = 'ark.mckinsey.com/';

export const ARK_LABELS = {
  // Hides a resource from dashboard listings
  DASHBOARD_HIDDEN: `${ARK_PREFIX}dashboard-hidden`,
} as const;
