import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelConfigurationFormContext } from '@/components/forms/model-forms/model-configuration-form-context';

const mockMutate = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams('namespace=custom-ns')),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: mockPush })),
}));

vi.mock('@/lib/services/models-hooks', () => ({
  useCreateModel: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'custom-ns',
    readOnlyMode: false,
    setNamespace: vi.fn(),
  })),
}));

vi.mock('@/components/ui/tracked-button', () => ({
  TrackedButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement> & { trackingEvent?: string; trackingProperties?: Record<string, unknown> }) => {
    const { trackingEvent, trackingProperties, ...rest } = props;
    return <button {...rest} />;
  },
}));

function TestModelConfiguratorForm() {
  const ctx = useContext(ModelConfigurationFormContext);
  if (!ctx) return null;
  return (
    <form
      id={ctx.formId}
      onSubmit={e => {
        e.preventDefault();
        ctx.onSubmit({
          name: 'test-model',
          provider: 'openai' as const,
          model: 'gpt-4',
          secret: 'my-secret',
          baseUrl: 'https://api.openai.com/v1',
        });
      }}>
      <button type="submit">Submit</button>
    </form>
  );
}

vi.mock(
  '@/components/forms/model-forms/model-configuration-form',
  () => ({
    ModelConfiguratorForm: TestModelConfiguratorForm,
  }),
);

import { CreateModelForm } from '@/components/forms/model-forms/create-model-form';

describe('CreateModelForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes namespace in mutate payload on submit', async () => {
    const user = userEvent.setup();

    render(<CreateModelForm />);

    await user.click(screen.getByText('Submit'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'custom-ns' }),
    );
  });
});
