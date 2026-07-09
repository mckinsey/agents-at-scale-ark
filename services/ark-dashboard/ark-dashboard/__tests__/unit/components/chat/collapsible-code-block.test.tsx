import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatMessage } from '@/components/chat/chat-message';
import { CollapsibleCodeBlock } from '@/components/chat/collapsible-code-block';
import { renderMarkdown } from '@/lib/hooks/render-markdown';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/lib/services/a2a-task-approvals', () => ({
  submitApproval: vi.fn(),
}));

const isBodyVisible = (container: HTMLElement): boolean => {
  const body = container.querySelector('pre')?.parentElement;
  return !!body && !body.className.includes('hidden');
};

describe('collapsible fenced code blocks', () => {
  describe('header and toggle', () => {
    it('shows the language label and a chevron toggle, and toggling hides then reveals the body', () => {
      const { container } = render(
        renderMarkdown('```javascript\nconst x = 1;\n```'),
      );

      const toggle = screen.getByRole('button', { name: /javascript/i });
      expect(toggle).toBeInTheDocument();
      expect(isBodyVisible(container)).toBe(true);

      fireEvent.click(toggle);
      expect(isBodyVisible(container)).toBe(false);

      fireEvent.click(toggle);
      expect(isBodyVisible(container)).toBe(true);
    });

    it('renders the provided language label in the header', () => {
      render(
        <CollapsibleCodeBlock language="text" className={undefined}>
          plain block
        </CollapsibleCodeBlock>,
      );

      expect(
        screen.getByRole('button', { name: /text/i }),
      ).toBeInTheDocument();
    });
  });

  describe('per-block state isolation', () => {
    it('toggling one block does not change another block', () => {
      const { container } = render(
        renderMarkdown(
          '```javascript\nconst a = 1;\n```\n\n```python\nb = 2\n```',
        ),
      );

      const blocks = Array.from(container.querySelectorAll('.my-4'));
      expect(blocks).toHaveLength(2);

      const firstToggle = screen.getByRole('button', { name: /javascript/i });
      fireEvent.click(firstToggle);

      const bodyOf = (block: Element): boolean => {
        const body = block.querySelector('pre')?.parentElement;
        return !!body && !body.className.includes('hidden');
      };

      expect(bodyOf(blocks[0])).toBe(false);
      expect(bodyOf(blocks[1])).toBe(true);
    });
  });

  describe('default-collapse setting', () => {
    it('renders expanded when the setting is unset', () => {
      const { container } = render(
        renderMarkdown('```javascript\nconst x = 1;\n```'),
      );

      expect(isBodyVisible(container)).toBe(true);
    });

    it('renders collapsed when defaultCodeCollapsed is true', () => {
      const { container } = render(
        renderMarkdown('```javascript\nconst x = 1;\n```', {
          defaultCodeCollapsed: true,
        }),
      );

      expect(isBodyVisible(container)).toBe(false);
    });

    it('lets the user expand a block that defaulted to collapsed', () => {
      const { container } = render(
        renderMarkdown('```javascript\nconst x = 1;\n```', {
          defaultCodeCollapsed: true,
        }),
      );

      const toggle = screen.getByRole('button', { name: /javascript/i });
      fireEvent.click(toggle);

      expect(isBodyVisible(container)).toBe(true);
    });
  });

  describe('content invariance', () => {
    it('keeps the code text equal to the source whether expanded or collapsed', () => {
      const source = 'const x = 1;';

      const expanded = render(
        renderMarkdown('```javascript\nconst x = 1;\n```'),
      );
      expect(
        expanded.container.querySelector('pre code')?.textContent,
      ).toContain(source);

      const collapsed = render(
        renderMarkdown('```javascript\nconst x = 1;\n```', {
          defaultCodeCollapsed: true,
        }),
      );
      expect(
        collapsed.container.querySelector('pre code')?.textContent,
      ).toContain(source);
    });
  });

  describe('via ChatMessage', () => {
    it('threads defaultCodeCollapsed into the rendered markdown', () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          viewMode="markdown"
          content={'```javascript\nconst x = 1;\n```'}
          defaultCodeCollapsed
        />,
      );

      expect(
        screen.getByRole('button', { name: /javascript/i }),
      ).toBeInTheDocument();
      expect(isBodyVisible(container)).toBe(false);
    });

    it('renders expanded by default when defaultCodeCollapsed is omitted', () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          viewMode="markdown"
          content={'```javascript\nconst x = 1;\n```'}
        />,
      );

      expect(isBodyVisible(container)).toBe(true);
    });
  });
});
