import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OriginCell, OriginColumnHeader } from './origin-column';

describe('OriginColumnHeader', () => {
  it('renders the Origin label and the info trigger', () => {
    render(<OriginColumnHeader tooltip="Where the agent was first created" />);
    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByLabelText('About Origin')).toBeInTheDocument();
  });
});

describe('OriginCell', () => {
  it('renders ARK when origin is missing', () => {
    render(<OriginCell origin={undefined} />);
    expect(screen.getByText('ARK')).toBeInTheDocument();
  });

  it('renders the resolved label for a known origin type', () => {
    render(<OriginCell origin={JSON.stringify({ type: 'github' })} />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });
});
