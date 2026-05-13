import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';

describe('Button', () => {
  describe('Button Component', () => {
    it('should render button element', () => {
      render(<Button>Click me</Button>);

      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });

    it('should have correct data-slot attribute', () => {
      const { container } = render(<Button>Test</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Button className="custom-button">Test</Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toHaveClass('custom-button');
    });

    it('should handle disabled state', () => {
      render(<Button disabled>Test</Button>);

      const button = screen.getByRole('button', { name: 'Test' });
      expect(button).toBeDisabled();
    });

    it('should handle click events', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <Button disabled onClick={handleClick}>
          Click
        </Button>,
      );

      const button = screen.getByRole('button', { name: 'Click' });
      await user.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should render children', () => {
      render(
        <Button>
          <span data-testid="child">Child content</span>
        </Button>,
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should wrap text nodes in span for underline effect', () => {
      const { container } = render(<Button>Text content</Button>);

      const textSpan = container.querySelector(
        'span.group-hover\\/btn\\:underline',
      );
      expect(textSpan).toBeInTheDocument();
      expect(textSpan).toHaveTextContent('Text content');
    });
  });

  describe('Button Variants', () => {
    it('should render with default variant', () => {
      const { container } = render(<Button variant="default">Default</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with accent variant', () => {
      const { container } = render(<Button variant="accent">Accent</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with destructive variant', () => {
      const { container } = render(
        <Button variant="destructive">Delete</Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with secondary variant', () => {
      const { container } = render(
        <Button variant="secondary">Secondary</Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with outline variant', () => {
      const { container } = render(<Button variant="outline">Outline</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with ghost variant', () => {
      const { container } = render(<Button variant="ghost">Ghost</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Button Sizes', () => {
    it('should render with default size', () => {
      const { container } = render(<Button size="default">Default</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with xxs size', () => {
      const { container } = render(<Button size="xxs">XXS</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with xs size', () => {
      const { container } = render(<Button size="xs">XS</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with sm size', () => {
      const { container } = render(<Button size="sm">Small</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with lg size', () => {
      const { container } = render(<Button size="lg">Large</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with icon-xs size', () => {
      const { container } = render(
        <Button size="icon-xs" aria-label="Icon XS">
          X
        </Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with icon-sm size', () => {
      const { container } = render(
        <Button size="icon-sm" aria-label="Icon SM">
          S
        </Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with icon size', () => {
      const { container } = render(
        <Button size="icon" aria-label="Icon">
          I
        </Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render with icon-lg size', () => {
      const { container } = render(
        <Button size="icon-lg" aria-label="Icon LG">
          L
        </Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Button Composition', () => {
    it('should support asChild prop for composition', () => {
      render(
        <Button asChild>
          <a href="/test" data-testid="link-button">
            Link Button
          </a>
        </Button>,
      );

      const link = screen.getByTestId('link-button');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/test');
      expect(link).toHaveAttribute('data-slot', 'button');
    });

    it('should merge props when using asChild', () => {
      const { container } = render(
        <Button asChild className="custom-class" disabled>
          <a href="/test">Link</a>
        </Button>,
      );

      const link = container.querySelector('[data-slot="button"]');
      expect(link).toHaveClass('custom-class');
    });

    it('should preserve children when using asChild', () => {
      render(
        <Button asChild>
          <a href="/test">Custom Link Text</a>
        </Button>,
      );

      expect(screen.getByText('Custom Link Text')).toBeInTheDocument();
    });
  });

  describe('Button Combined Variants', () => {
    it('should combine variant and size', () => {
      const { container } = render(
        <Button variant="accent" size="lg">
          Large Accent
        </Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Large Accent');
    });

    it('should work with multiple size options', () => {
      const { container, rerender } = render(
        <Button size="sm">Small</Button>,
      );

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();

      rerender(<Button size="lg">Large</Button>);

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();
    });

    it('should work with multiple variant options', () => {
      const { container, rerender } = render(
        <Button variant="default">Default</Button>,
      );

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();

      rerender(<Button variant="outline">Outline</Button>);

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();

      rerender(<Button variant="ghost">Ghost</Button>);

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();
    });
  });

  describe('Button Accessibility', () => {
    it('should support aria-label', () => {
      render(<Button aria-label="Close dialog">×</Button>);

      expect(
        screen.getByRole('button', { name: 'Close dialog' }),
      ).toBeInTheDocument();
    });

    it('should support type attribute', () => {
      render(<Button type="submit">Submit</Button>);

      const button = screen.getByRole('button', { name: 'Submit' });
      expect(button).toHaveAttribute('type', 'submit');
    });

    it('should be keyboard accessible', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Keyboard Test</Button>);

      const button = screen.getByRole('button', { name: 'Keyboard Test' });
      button.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('Button States', () => {
    it('should handle loading-like state with disabled', () => {
      const { container } = render(
        <Button disabled>
          <span>Loading...</span>
        </Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Loading...');
    });

    it('should work with ref forwarding', () => {
      const ref = vi.fn();

      render(
        <Button ref={ref}>
          <span>Ref Test</span>
        </Button>,
      );

      expect(ref).toHaveBeenCalled();
    });
  });
});
