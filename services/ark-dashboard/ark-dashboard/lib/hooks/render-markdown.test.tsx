import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './render-markdown';

describe('renderMarkdown', () => {
  describe('mermaid fenced block', () => {
    it('shows the source as a code block and offers a "View Diagram" button', () => {
      const { container } = render(
        renderMarkdown('```mermaid\ngraph TD\nA --> B\n```'),
      );

      expect(container.textContent).toContain('graph TD');
      expect(container.textContent).toContain('A --> B');
      expect(
        screen.getByRole('button', { name: /view diagram/i }),
      ).toBeInTheDocument();
    });

    it('does not open the diagram modal until the button is clicked', () => {
      render(renderMarkdown('```mermaid\ngraph TD\nA --> B\n```'));

      expect(screen.queryByText('Mermaid Diagram')).not.toBeInTheDocument();
    });
  });

  describe('code blocks vs inline code', () => {
    it('renders a fenced non-mermaid block inside <pre><code>', () => {
      const { container } = render(
        renderMarkdown('```javascript\nconst x = 1;\n```'),
      );

      const codeInPre = container.querySelector('pre code');
      expect(codeInPre).not.toBeNull();
      expect(codeInPre?.className).toContain('language-javascript');
      expect(codeInPre?.textContent).toContain('const x = 1;');
    });

    it('renders inline code as bare <code> with no <pre> ancestor', () => {
      const { container } = render(renderMarkdown('Use `inline` code'));

      const code = container.querySelector('code');
      expect(code).not.toBeNull();
      expect(code?.textContent).toBe('inline');
      expect(code?.closest('pre')).toBeNull();
    });
  });

  describe('links', () => {
    it('renders external links with target="_blank" and rel="noreferrer"', () => {
      const { container } = render(
        renderMarkdown('[click](https://example.com)'),
      );

      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.getAttribute('href')).toBe('https://example.com');
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noreferrer');
      expect(link?.textContent).toBe('click');
    });
  });

  describe('heading scale', () => {
    it('renders each level # through ###### as its matching tag', () => {
      const { container } = render(
        renderMarkdown(
          '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6',
        ),
      );

      expect(container.querySelector('h1')?.textContent).toBe('H1');
      expect(container.querySelector('h2')?.textContent).toBe('H2');
      expect(container.querySelector('h3')?.textContent).toBe('H3');
      expect(container.querySelector('h4')?.textContent).toBe('H4');
      expect(container.querySelector('h5')?.textContent).toBe('H5');
      expect(container.querySelector('h6')?.textContent).toBe('H6');
    });
  });

  describe('tables', () => {
    it('renders a GFM table with header cells and body cells', () => {
      const { container } = render(
        renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |'),
      );

      const table = container.querySelector('table');
      expect(table).not.toBeNull();

      const headerCells = table!.querySelectorAll('thead th');
      expect(headerCells).toHaveLength(2);
      expect(headerCells[0].textContent).toBe('a');
      expect(headerCells[1].textContent).toBe('b');

      const bodyRows = table!.querySelectorAll('tbody tr');
      expect(bodyRows).toHaveLength(2);
      expect(bodyRows[0].querySelector('td')?.textContent).toBe('1');
      expect(bodyRows[1].querySelector('td')?.textContent).toBe('3');
    });
  });
});
