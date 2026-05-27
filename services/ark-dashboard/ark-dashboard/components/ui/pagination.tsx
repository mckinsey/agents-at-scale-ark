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

function getPageItems(
  currentPage: number,
  totalPages: number,
  siblingCount: number,
): PageItem[] {
  const totalPageNumbers = siblingCount * 2 + 5;

  if (totalPages <= totalPageNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < totalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftRange = Array.from(
      { length: 3 + siblingCount * 2 },
      (_, i) => i + 1,
    );
    return [...leftRange, 'ellipsis-right', totalPages];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightRange = Array.from(
      { length: 3 + siblingCount * 2 },
      (_, i) => totalPages - (3 + siblingCount * 2) + 1 + i,
    );
    return [1, 'ellipsis-left', ...rightRange];
  }

  const middleRange = Array.from(
    { length: rightSiblingIndex - leftSiblingIndex + 1 },
    (_, i) => leftSiblingIndex + i,
  );
  return [1, 'ellipsis-left', ...middleRange, 'ellipsis-right', totalPages];
}

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
