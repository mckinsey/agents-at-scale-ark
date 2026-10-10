import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarketplaceSourceErrors } from './marketplace-source-errors';

describe('MarketplaceSourceErrors', () => {
  it('renders nothing when there are no errors', () => {
    const { container } = render(<MarketplaceSourceErrors errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('surfaces an authentication failure for a source', () => {
    render(
      <MarketplaceSourceErrors
        errors={[
          {
            source: 'priv',
            displayName: 'Private Mirror',
            message: 'authentication failed',
            code: 'auth_error',
          },
        ]}
      />,
    );
    expect(screen.getByText('Private Mirror')).toBeInTheDocument();
    expect(screen.getByText(/authentication failed/i)).toBeInTheDocument();
  });
});
