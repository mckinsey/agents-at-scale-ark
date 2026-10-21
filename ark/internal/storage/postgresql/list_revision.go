/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"fmt"

	"mckinsey.com/ark/internal/storage"
)

func checkListRevision(head int64, rev storage.ListRevision) error {
	if rev.RV == 0 {
		return nil
	}
	if head < rev.RV {
		return &storage.TooLargeResourceVersionError{Requested: rev.RV, Current: head}
	}
	if rev.Exact && head > rev.RV {
		return fmt.Errorf("%w: resourceVersion %d is below the store head %d; exact reads are served only at the current head", storage.ErrResourceExpired, rev.RV, head)
	}
	return nil
}
