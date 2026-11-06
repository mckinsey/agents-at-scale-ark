import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { A2AEndpointValue } from './a2a-endpoint-value';

describe('A2AEndpointValue', () => {
  it('warns and explains the fix when the endpoint does not match the card', async () => {
    render(
      <TooltipProvider>
        <A2AEndpointValue
          endpoint="https://agentcore.example.com/a2a/"
          mismatch
        />
      </TooltipProvider>,
    );

    await userEvent.hover(screen.getByRole('button', { name: /mismatch/i }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /set endpointResolution to cardUrl or cardPath/,
    );
  });

  it('shows only the endpoint when it matches the card', () => {
    render(
      <TooltipProvider>
        <A2AEndpointValue
          endpoint="http://simple-agent.default.svc.cluster.local:80"
          mismatch={false}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByText('http://simple-agent.default.svc.cluster.local:80'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Mismatch')).not.toBeInTheDocument();
  });
});
