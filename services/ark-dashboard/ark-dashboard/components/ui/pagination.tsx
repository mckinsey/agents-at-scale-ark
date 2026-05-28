import { ArrowBack, ArrowForward } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface PaginationProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
  readonly siblingCount?: number;
  readonly className?: string;
  readonly itemsPerPage?: number;
  readonly onItemsPerPageChange?: (itemsPerPage: number) => void;
  readonly itemsPerPageOptions?: number[];
}

type PageItem = number | 'ellipsis-left' | 'ellipsis-right';

const range = (start: number, end: number): number[] =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i);

/**
 * Builds the pagination item list matching the Figma design:
 *   current=1,  total=48 → [1, 2, 3, …, 47, 48]
 *   current=3,  total=48 → [1, 2, 3, 4, …, 47, 48]
 *   current=24, total=48 → [1, 2, …, 23, 24, 25, …, 47, 48]
 *   current=48, total=48 → [1, 2, …, 46, 47, 48]
 *
 * Always shows the first/last `boundaryCount` (default 2) pages plus a sliding
 * window of `siblingCount` (default 1) around the current page. When the window
 * touches a boundary the gap collapses and the inner side extends just far
 * enough to keep the active page visible.
 */
function getPageItems(
  currentPage: number,
  totalPages: number,
  siblingCount = 1,
  boundaryCount = 2,
): PageItem[] {
  // If everything fits without ellipses, show all pages.
  const minSlotsForEllipsis = boundaryCount * 2 + siblingCount * 2 + 3;
  if (totalPages <= minSlotsForEllipsis) {
    return range(1, totalPages);
  }

  const nearStart = currentPage <= boundaryCount + siblingCount + 1;
  const nearEnd = currentPage >= totalPages - boundaryCount - siblingCount;

  if (nearStart) {
    // [1 .. max(boundary+1, current+sibling)] + ellipsis + last boundary
    const leftExtent = Math.max(
      boundaryCount + 1,
      currentPage + siblingCount,
    );
    return [
      ...range(1, leftExtent),
      'ellipsis-right',
      ...range(totalPages - boundaryCount + 1, totalPages),
    ];
  }

  if (nearEnd) {
    // First boundary + ellipsis + [min(totalPages-boundary, current-sibling) .. totalPages]
    const rightStart = Math.min(
      totalPages - boundaryCount,
      currentPage - siblingCount,
    );
    return [
      ...range(1, boundaryCount),
      'ellipsis-left',
      ...range(rightStart, totalPages),
    ];
  }

  // Middle: boundary + ellipsis + current ± siblingCount + ellipsis + boundary
  return [
    ...range(1, boundaryCount),
    'ellipsis-left',
    ...range(currentPage - siblingCount, currentPage + siblingCount),
    'ellipsis-right',
    ...range(totalPages - boundaryCount + 1, totalPages),
  ];
}

export { getPageItems };

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  className,
  itemsPerPage,
  onItemsPerPageChange,
  itemsPerPageOptions = [10, 25, 50, 100],
}: PaginationProps) {
  const showItemsPerPage =
    itemsPerPage !== undefined && onItemsPerPageChange !== undefined;

  if (totalPages <= 1 && !showItemsPerPage) {
    return null;
  }

  const items = getPageItems(currentPage, totalPages, siblingCount);
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  return (
    <div
      className={cn(
        'flex w-full items-center py-3',
        showItemsPerPage ? 'justify-between' : 'justify-center',
        className,
      )}>
      {showItemsPerPage && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-secondary">Items per page:</span>
          <Select
            value={itemsPerPage.toString()}
            onValueChange={(value: unknown) =>
              onItemsPerPageChange(parseInt(value as string, 10))
            }>
            <SelectTrigger className="h-8 w-20">
              <SelectValue placeholder={itemsPerPage.toString()} />
            </SelectTrigger>
            <SelectContent>
              {itemsPerPageOptions.map(option => (
                <SelectItem key={option} value={option.toString()}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <nav aria-label="Pagination">
        <ul className="flex items-center gap-2">
          <li>
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={isFirstPage}
              aria-label="Go to previous page"
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-none px-3 py-2 text-fg-primary transition-opacity',
                'hover:bg-stateslayer-overlay-hover',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
              )}>
              <IconShell size="sm">
                <ArrowBack />
              </IconShell>
              <span className="text-sm leading-5 tracking-[-0.028px]">
                Previous
              </span>
            </button>
          </li>

          {items.map((item, index) => {
            if (item === 'ellipsis-left' || item === 'ellipsis-right') {
              return (
                <li
                  key={`${item}-${index}`}
                  aria-hidden="true"
                  className="flex w-10 items-center justify-center px-4 py-2 text-fg-primary">
                  <span className="text-base font-semibold leading-6 tracking-[-0.4px]">
                    …
                  </span>
                </li>
              );
            }

            const isActive = item === currentPage;
            return (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => onPageChange(item)}
                  aria-label={`Go to page ${item}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex cursor-pointer items-center justify-center rounded-none px-3 py-2 text-fg-primary',
                    'hover:bg-stateslayer-overlay-hover',
                    isActive && 'bg-stateslayer-overlay-pressed',
                  )}>
                  <span className="text-sm leading-5 tracking-[-0.028px]">
                    {item}
                  </span>
                </button>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={isLastPage}
              aria-label="Go to next page"
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-none px-3 py-2 text-fg-primary transition-opacity',
                'hover:bg-stateslayer-overlay-hover',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
              )}>
              <span className="text-sm leading-5 tracking-[-0.028px]">
                Next
              </span>
              <IconShell size="sm">
                <ArrowForward />
              </IconShell>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
