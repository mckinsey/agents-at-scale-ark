import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { BasicInfoSection } from '@/components/forms/team-form/sections/basic-info-section';
import { TeamFormMode } from '@/components/forms/team-form/types';
import { Form } from '@/components/ui/form';

const schema = z.object({
  name: z.string(),
  description: z.string().optional(),
  strategy: z.string(),
  maxTurns: z.string().optional(),
  selectorAgent: z.string().optional(),
  selectorPrompt: z.string().optional(),
});

function Wrapper({
  mode = TeamFormMode.CREATE,
  disabled = false,
}: {
  mode?: TeamFormMode;
  disabled?: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      strategy: 'round-robin',
      maxTurns: '',
      selectorAgent: '',
      selectorPrompt: '',
    },
  });

  return (
    <Form {...form}>
      <BasicInfoSection form={form} mode={mode} disabled={disabled} />
    </Form>
  );
}

describe('BasicInfoSection', () => {
  it('should render name and description fields', () => {
    render(<Wrapper />);
    expect(
      screen.getByPlaceholderText('e.g., engineering-team'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        'e.g., Core development and infrastructure team',
      ),
    ).toBeInTheDocument();
  });

  it('should show required indicator for name in create mode', () => {
    render(<Wrapper mode={TeamFormMode.CREATE} />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('should not show required indicator for name in view mode', () => {
    render(<Wrapper mode={TeamFormMode.VIEW} />);
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('should disable name field in view mode', () => {
    render(<Wrapper mode={TeamFormMode.VIEW} />);
    expect(
      screen.getByPlaceholderText('e.g., engineering-team'),
    ).toBeDisabled();
  });

  it('should disable fields when disabled prop is true', () => {
    render(<Wrapper disabled={true} />);
    expect(
      screen.getByPlaceholderText(
        'e.g., Core development and infrastructure team',
      ),
    ).toBeDisabled();
  });

  it('should render Basic Information heading', () => {
    render(<Wrapper />);
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
  });
});
