import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  StatusIndicator,
  UNKNOWN_STATUS,
  getAvailabilityStatus,
} from '@/components/ui/status-indicator';

describe('getAvailabilityStatus', () => {
  it('maps True to Active', () => {
    expect(getAvailabilityStatus('True')).toEqual({
      label: 'Active',
      dotClass: 'bg-status-success',
    });
  });

  it('maps False to Error', () => {
    expect(getAvailabilityStatus('False')).toEqual({
      label: 'Error',
      dotClass: 'bg-status-error',
    });
  });

  it('falls back to Unknown for null, undefined and unrecognised values', () => {
    expect(getAvailabilityStatus(null)).toEqual(UNKNOWN_STATUS);
    expect(getAvailabilityStatus(undefined)).toEqual(UNKNOWN_STATUS);
    expect(getAvailabilityStatus('Degraded')).toEqual(UNKNOWN_STATUS);
  });
});

describe('StatusIndicator', () => {
  it('renders the label', () => {
    render(<StatusIndicator label="Ready" dotClass="bg-status-success" />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('hides the dot from assistive technology', () => {
    const { container } = render(
      <StatusIndicator label="Ready" dotClass="bg-status-success" />,
    );

    const dot = container.querySelector('[aria-hidden]');
    expect(dot).toHaveClass('bg-status-success');
  });

  it('renders trailing children after the label', () => {
    render(
      <StatusIndicator label="Running" dotClass="bg-status-information">
        <button type="button">Cancel</button>
      </StatusIndicator>,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('applies a caller className to the wrapper', () => {
    const { container } = render(
      <StatusIndicator
        label="Ready"
        dotClass="bg-status-success"
        className="group/status"
      />,
    );

    expect(container.firstChild).toHaveClass('group/status');
  });
});
