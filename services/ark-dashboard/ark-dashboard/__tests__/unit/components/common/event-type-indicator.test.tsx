import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EventTypeIndicator } from '@/components/common/event-type-indicator';

describe('EventTypeIndicator', () => {
  it('should render the event type text', () => {
    render(<EventTypeIndicator type="Warning" />);

    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('should colour Warning with the warning token', () => {
    render(<EventTypeIndicator type="Warning" />);

    expect(screen.getByText('Warning')).toHaveClass('text-fg-warning');
  });

  it('should colour Normal with the success token', () => {
    render(<EventTypeIndicator type="Normal" />);

    expect(screen.getByText('Normal')).toHaveClass('text-fg-success');
  });

  it('should fall back to the primary token for unknown types', () => {
    render(<EventTypeIndicator type="Informational" />);

    expect(screen.getByText('Informational')).toHaveClass('text-fg-primary');
  });

  it('should match the type case-insensitively', () => {
    render(<EventTypeIndicator type="warning" />);

    expect(screen.getByText('warning')).toHaveClass('text-fg-warning');
  });

  it('should render a dash when the type is undefined', () => {
    render(<EventTypeIndicator type={undefined} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should render a dash when the type is null', () => {
    render(<EventTypeIndicator type={null} />);

    expect(screen.getByText('—')).toHaveClass('text-fg-secondary');
  });

  it('should render a dash when the type is an empty string', () => {
    render(<EventTypeIndicator type="" />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should merge a custom className', () => {
    render(<EventTypeIndicator type="Normal" className="max-w-xs" />);

    expect(screen.getByText('Normal')).toHaveClass('max-w-xs');
  });
});
