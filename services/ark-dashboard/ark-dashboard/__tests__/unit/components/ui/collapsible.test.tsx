import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

describe('Collapsible', () => {
  describe('Collapsible Component', () => {
    it('should render collapsible root element', () => {
      const { container } = render(
        <Collapsible>
          <div>Content</div>
        </Collapsible>,
      );

      const collapsible = container.querySelector('[data-slot="collapsible"]');
      expect(collapsible).toBeInTheDocument();
    });

    it('should pass through props to root element', () => {
      const { container } = render(
        <Collapsible open={true} onOpenChange={() => {}}>
          <div>Content</div>
        </Collapsible>,
      );

      const collapsible = container.querySelector('[data-slot="collapsible"]');
      expect(collapsible).toBeInTheDocument();
    });

    it('should render children', () => {
      render(
        <Collapsible>
          <div data-testid="child">Child Content</div>
        </Collapsible>,
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  describe('CollapsibleTrigger', () => {
    it('should render trigger button', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      expect(screen.getByText('Toggle')).toBeInTheDocument();
    });

    it('should have correct data attributes', () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger isActive={true}>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      const trigger = container.querySelector(
        '[data-slot="collapsible-trigger"]',
      );
      expect(trigger).toHaveAttribute('data-active', 'true');
    });

    it('should not show chevron by default', () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      const chevrons = container.querySelectorAll('svg');
      expect(chevrons).toHaveLength(0);
    });

    it('should show chevron when showChevron is true', () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger showChevron={true}>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      const chevrons = container.querySelectorAll('svg');
      expect(chevrons.length).toBeGreaterThan(0);
    });

    it('should show chevron when open prop is provided', () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger open={true}>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      const chevrons = container.querySelectorAll('svg');
      expect(chevrons.length).toBeGreaterThan(0);
    });

    it('should show ChevronUp when open is true', () => {
      const { container } = render(
        <Collapsible open={true}>
          <CollapsibleTrigger open={true}>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      expect(screen.getByText('Toggle')).toBeInTheDocument();
    });

    it('should show ChevronDown when open is false', () => {
      const { container } = render(
        <Collapsible open={false}>
          <CollapsibleTrigger open={false}>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      expect(screen.getByText('Toggle')).toBeInTheDocument();
    });

    it('should apply active styling when isActive is true', () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger isActive={true}>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      const trigger = container.querySelector(
        '[data-slot="collapsible-trigger"]',
      );
      expect(trigger).toHaveAttribute('data-active', 'true');
    });

    it('should not apply active styling when isActive is false', () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger isActive={false}>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );

      const trigger = container.querySelector(
        '[data-slot="collapsible-trigger"]',
      );
      expect(trigger).toHaveAttribute('data-active', 'false');
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger className="custom-class">
            Toggle
          </CollapsibleTrigger>
        </Collapsible>,
      );

      const trigger = container.querySelector(
        '[data-slot="collapsible-trigger"]',
      );
      expect(trigger).toHaveClass('custom-class');
    });
  });

  describe('CollapsibleContent', () => {
    it('should render content element', () => {
      const { container } = render(
        <Collapsible open={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <div data-testid="content">Content</div>
          </CollapsibleContent>
        </Collapsible>,
      );

      const content = container.querySelector(
        '[data-slot="collapsible-content"]',
      );
      expect(content).toBeInTheDocument();
    });

    it('should apply correct margin style', () => {
      const { container } = render(
        <Collapsible open={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <div>Content</div>
          </CollapsibleContent>
        </Collapsible>,
      );

      const content = container.querySelector(
        '[data-slot="collapsible-content"]',
      );
      expect(content).toHaveStyle({ marginLeft: '32px' });
    });

    it('should render children when open', () => {
      render(
        <Collapsible open={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <div data-testid="content-child">Content Child</div>
          </CollapsibleContent>
        </Collapsible>,
      );

      expect(screen.getByTestId('content-child')).toBeInTheDocument();
    });
  });

  describe('Collapsible Integration', () => {
    it('should toggle content visibility', async () => {
      const user = userEvent.setup();

      render(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <div data-testid="content">Hidden Content</div>
          </CollapsibleContent>
        </Collapsible>,
      );

      const trigger = screen.getByText('Toggle');
      await user.click(trigger);

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('should work with controlled state', () => {
      const { rerender } = render(
        <Collapsible open={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <div data-testid="content">Content</div>
          </CollapsibleContent>
        </Collapsible>,
      );

      rerender(
        <Collapsible open={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <div data-testid="content">Content</div>
          </CollapsibleContent>
        </Collapsible>,
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('should render multiple items in content', () => {
      render(
        <Collapsible open={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <div data-testid="item-1">Item 1</div>
            <div data-testid="item-2">Item 2</div>
            <div data-testid="item-3">Item 3</div>
          </CollapsibleContent>
        </Collapsible>,
      );

      expect(screen.getByTestId('item-1')).toBeInTheDocument();
      expect(screen.getByTestId('item-2')).toBeInTheDocument();
      expect(screen.getByTestId('item-3')).toBeInTheDocument();
    });

    it('should work with complex nested content', () => {
      render(
        <Collapsible open={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <div>
              <span data-testid="nested">Nested Content</span>
              <button>Action</button>
            </div>
          </CollapsibleContent>
        </Collapsible>,
      );

      expect(screen.getByTestId('nested')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });
  });
});
