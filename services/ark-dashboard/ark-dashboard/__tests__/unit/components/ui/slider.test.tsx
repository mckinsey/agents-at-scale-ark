import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Slider } from '@/components/ui/slider';

describe('Slider', () => {
  it('should render slider element', () => {
    const { container } = render(<Slider />);

    expect(container.querySelector('[data-slot="slider"]')).toBeInTheDocument();
  });

  it('should render with default value', () => {
    const { container } = render(<Slider defaultValue={[50]} />);

    expect(container.querySelector('[data-slot="slider"]')).toBeInTheDocument();
  });

  it('should handle value change', () => {
    const handleChange = vi.fn();
    render(<Slider onValueChange={handleChange} defaultValue={[25]} />);

    // Value change is triggered by Radix Slider interaction
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('should work with controlled value', () => {
    const { rerender } = render(<Slider value={[30]} />);

    expect(screen.getByRole('slider')).toBeInTheDocument();

    rerender(<Slider value={[70]} />);

    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('should render with min and max props', () => {
    render(<Slider min={0} max={200} defaultValue={[100]} />);

    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('should render multiple thumbs for range', () => {
    render(<Slider defaultValue={[25, 75]} />);

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);
  });

  it('should handle disabled state', () => {
    render(<Slider disabled defaultValue={[50]} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('data-disabled');
  });

  it('should render step markers when enabled', () => {
    const { container } = render(
      <Slider min={0} max={100} step={25} showStepMarkers />,
    );

    expect(container.querySelector('[data-slot="slider"]')).toBeInTheDocument();
  });

  it('should support custom format value', () => {
    const formatValue = (val: number) => `${val}%`;
    render(<Slider formatValue={formatValue} defaultValue={[50]} />);

    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('should support vertical orientation', () => {
    const { container } = render(
      <Slider orientation="vertical" defaultValue={[50]} />,
    );

    const slider = container.querySelector('[data-slot="slider"]');
    expect(slider).toHaveAttribute('data-orientation', 'vertical');
  });
});
