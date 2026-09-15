import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PromptEditor, type PromptEditorRef } from '@/components/ui/prompt-editor';

describe('PromptEditor', () => {
  it('renders placeholder when value is empty (default variant)', () => {
    render(
      <PromptEditor
        value=""
        onChange={vi.fn()}
        placeholder="Type your prompt..."
      />,
    );
    expect(screen.getByText('Type your prompt...')).toBeInTheDocument();
  });

  it('renders placeholder with compact-variant styling', () => {
    render(
      <PromptEditor
        value=""
        onChange={vi.fn()}
        placeholder="hint"
        variant="compact"
      />,
    );
    const placeholder = screen.getByText('hint');
    expect(placeholder.className).toContain('text-white/[0.38]');
    expect(screen.getByText('txt')).toBeInTheDocument();
  });

  it('calls onChange when user types', async () => {
    const onChange = vi.fn();
    render(<PromptEditor value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'h');
    expect(onChange).toHaveBeenCalledWith('h');
  });

  it('highlights defined parameters with the defined-style class', () => {
    render(
      <PromptEditor
        value="Hello {{.name}}"
        onChange={vi.fn()}
        parameters={[{ name: 'name' }]}
      />,
    );
    const span = screen.getByTitle('Parameter: name');
    expect(span.className).toContain('emerald');
  });

  it('highlights undefined parameters with the warning class', () => {
    render(
      <PromptEditor
        value="Hello {{.missing}}"
        onChange={vi.fn()}
        parameters={[]}
      />,
    );
    const span = screen.getByTitle('Undefined parameter: missing');
    expect(span.className).toContain('amber');
  });

  it('uses cyan/warning highlight classes in compact variant', () => {
    render(
      <PromptEditor
        value="{{.defined}} {{.missing}}"
        onChange={vi.fn()}
        parameters={[{ name: 'defined' }]}
        variant="compact"
      />,
    );
    expect(screen.getByTitle('Parameter: defined').className).toContain(
      '#08bdba',
    );
    expect(
      screen.getByTitle('Undefined parameter: missing').className,
    ).toContain('status-warning');
  });

  it('disables the textarea when disabled prop is true', () => {
    render(<PromptEditor value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('exposes focus() and blur() via forwardRef', () => {
    const ref = createRef<PromptEditorRef>();
    render(<PromptEditor ref={ref} value="" onChange={vi.fn()} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const focusSpy = vi.spyOn(textarea, 'focus');
    const blurSpy = vi.spyOn(textarea, 'blur');
    ref.current?.focus();
    ref.current?.blur();
    expect(focusSpy).toHaveBeenCalled();
    expect(blurSpy).toHaveBeenCalled();
  });
});
