import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DetailCard,
  DetailRow,
  DetailSectionCard,
} from '@/components/common/detail-card';

describe('DetailCard', () => {
  it('should render the title', () => {
    render(<DetailCard title="Basic information">content</DetailCard>);

    expect(screen.getByText('Basic information')).toBeInTheDocument();
  });

  it('should render children', () => {
    render(
      <DetailCard title="Basic information">
        <span>child node</span>
      </DetailCard>,
    );

    expect(screen.getByText('child node')).toBeInTheDocument();
  });
});

describe('DetailRow', () => {
  it('should render label and value', () => {
    render(<DetailRow label="Namespace" value="default" />);

    expect(screen.getByText('Namespace')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('should render a plain label when no tooltip is given', () => {
    const { container } = render(
      <DetailRow label="Namespace" value="default" />,
    );

    expect(
      container.querySelector('[data-slot="tooltip-trigger"]'),
    ).not.toBeInTheDocument();
  });

  it('should render a tooltip trigger when a tooltip is given', () => {
    const { container } = render(
      <DetailRow
        label="Namespace"
        value="default"
        tooltip="Kubernetes namespace"
      />,
    );

    const trigger = container.querySelector('[data-slot="tooltip-trigger"]');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Namespace');
  });

  it('should set the title attribute for string values', () => {
    render(<DetailRow label="Namespace" value="default" />);

    expect(screen.getByText('default')).toHaveAttribute('title', 'default');
  });

  it('should omit the title attribute for non-string values', () => {
    render(<DetailRow label="Type" value={<span>Warning</span>} />);

    expect(screen.getByText('Warning').parentElement).not.toHaveAttribute(
      'title',
    );
  });

  it('should truncate the value by default', () => {
    render(<DetailRow label="Namespace" value="default" />);

    expect(screen.getByText('default')).toHaveClass('truncate');
  });

  it('should replace the default truncate class when valueClassName is given', () => {
    render(
      <DetailRow label="Namespace" value="default" valueClassName="min-w-0" />,
    );

    const value = screen.getByText('default');
    expect(value).toHaveClass('min-w-0');
    expect(value).not.toHaveClass('truncate');
  });

  it('should render a bottom border by default', () => {
    const { container } = render(
      <DetailRow label="Namespace" value="default" />,
    );

    expect(container.firstChild).toHaveClass('border-b');
  });

  it('should omit the bottom border on the last row', () => {
    const { container } = render(
      <DetailRow label="Namespace" value="default" last />,
    );

    expect(container.firstChild).not.toHaveClass('border-b');
  });
});

describe('DetailSectionCard', () => {
  it('should render title and children', () => {
    render(
      <DetailSectionCard title="Involved object">
        <span>child node</span>
      </DetailSectionCard>,
    );

    expect(screen.getByText('Involved object')).toBeInTheDocument();
    expect(screen.getByText('child node')).toBeInTheDocument();
  });

  it('should render headerRight when given', () => {
    render(
      <DetailSectionCard
        title="Involved object"
        headerRight={<button>Copy</button>}>
        content
      </DetailSectionCard>,
    );

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('should render without headerRight', () => {
    render(
      <DetailSectionCard title="Involved object">content</DetailSectionCard>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
