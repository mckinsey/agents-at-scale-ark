import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination, getPageItems } from '@/components/ui/pagination';

describe('getPageItems', () => {
  describe('small page counts (no ellipsis)', () => {
    it('returns single page when totalPages is 1', () => {
      expect(getPageItems(1, 1)).toEqual([1]);
    });

    it('returns all pages when totalPages equals the threshold', () => {
      // boundary=2, sibling=1 → minSlotsForEllipsis = 2*2 + 1*2 + 3 = 9
      expect(getPageItems(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('returns all pages when totalPages is below threshold', () => {
      expect(getPageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });

  describe('near the start boundary', () => {
    it('matches Figma 1 2 3 … 47 48 for current=1, total=48', () => {
      expect(getPageItems(1, 48)).toEqual([
        1,
        2,
        3,
        'ellipsis-right',
        47,
        48,
      ]);
    });

    it('keeps the same 3-page window when current=2', () => {
      expect(getPageItems(2, 48)).toEqual([
        1,
        2,
        3,
        'ellipsis-right',
        47,
        48,
      ]);
    });

    it('extends the window so current=3 stays visible', () => {
      expect(getPageItems(3, 48)).toEqual([
        1,
        2,
        3,
        4,
        'ellipsis-right',
        47,
        48,
      ]);
    });

    it('keeps the active page visible at the edge of the near-start range', () => {
      // boundary + sibling + 1 = 4 → current=4 still triggers nearStart
      expect(getPageItems(4, 48)).toEqual([
        1,
        2,
        3,
        4,
        5,
        'ellipsis-right',
        47,
        48,
      ]);
    });
  });

  describe('near the end boundary', () => {
    it('matches Figma 1 2 … 46 47 48 for current=48, total=48', () => {
      expect(getPageItems(48, 48)).toEqual([
        1,
        2,
        'ellipsis-left',
        46,
        47,
        48,
      ]);
    });

    it('keeps the same 3-page window when current=47', () => {
      expect(getPageItems(47, 48)).toEqual([
        1,
        2,
        'ellipsis-left',
        46,
        47,
        48,
      ]);
    });

    it('extends the window so current=46 stays visible', () => {
      expect(getPageItems(46, 48)).toEqual([
        1,
        2,
        'ellipsis-left',
        45,
        46,
        47,
        48,
      ]);
    });
  });

  describe('middle pages (both ellipses)', () => {
    it('shows boundary + sliding window + boundary for current=24', () => {
      expect(getPageItems(24, 48)).toEqual([
        1,
        2,
        'ellipsis-left',
        23,
        24,
        25,
        'ellipsis-right',
        47,
        48,
      ]);
    });

    it('shows just three siblings around current page', () => {
      expect(getPageItems(10, 50)).toEqual([
        1,
        2,
        'ellipsis-left',
        9,
        10,
        11,
        'ellipsis-right',
        49,
        50,
      ]);
    });
  });

  describe('custom siblingCount', () => {
    it('shows ±2 siblings when siblingCount=2', () => {
      // boundary=2, sibling=2 → minSlotsForEllipsis = 4 + 4 + 3 = 11
      // total=20 > 11, currentPage=10 is middle (not near start/end)
      expect(getPageItems(10, 20, 2)).toEqual([
        1,
        2,
        'ellipsis-left',
        8,
        9,
        10,
        11,
        12,
        'ellipsis-right',
        19,
        20,
      ]);
    });
  });
});

describe('Pagination component', () => {
  it('returns null when totalPages is 1 and no items-per-page selector', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the nav landmark with aria-label', () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('renders Previous and Next buttons', () => {
    render(
      <Pagination currentPage={2} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Go to previous page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Go to next page' }),
    ).toBeInTheDocument();
  });

  it('disables Previous on the first page', () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Go to previous page' }),
    ).toBeDisabled();
  });

  it('disables Next on the last page', () => {
    render(
      <Pagination currentPage={5} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Go to next page' }),
    ).toBeDisabled();
  });

  it('marks the active page with aria-current', () => {
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Go to page 3' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('button', { name: 'Go to page 2' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('calls onPageChange when clicking a page number', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Go to page 3' }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange(currentPage - 1) when Previous is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Go to previous page' }),
    );

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange(currentPage + 1) when Next is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('does not invoke onPageChange when clicking Previous on page 1', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Go to previous page' }),
    );

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('renders an ellipsis when there are skipped pages', () => {
    render(
      <Pagination currentPage={1} totalPages={48} onPageChange={vi.fn()} />,
    );
    // Figma pattern for current=1, total=48: 1 2 3 … 47 48
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 47' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 48' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to page 4' })).not.toBeInTheDocument();
  });

  it('hides ellipsis from assistive tech via aria-hidden', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={48} onPageChange={vi.fn()} />,
    );
    const ellipses = container.querySelectorAll('li[aria-hidden="true"]');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  describe('with optional itemsPerPage selector', () => {
    it('renders the items-per-page selector when both props are provided', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={vi.fn()}
          itemsPerPage={25}
          onItemsPerPageChange={vi.fn()}
        />,
      );
      expect(screen.getByText('Items per page:')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('does not render the selector when only itemsPerPage is provided without callback', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={vi.fn()}
          itemsPerPage={25}
        />,
      );
      expect(screen.queryByText('Items per page:')).not.toBeInTheDocument();
    });

    it('still renders when totalPages is 1 if items-per-page selector is shown', () => {
      const { container } = render(
        <Pagination
          currentPage={1}
          totalPages={1}
          onPageChange={vi.fn()}
          itemsPerPage={25}
          onItemsPerPageChange={vi.fn()}
        />,
      );
      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('Items per page:')).toBeInTheDocument();
    });
  });
});
