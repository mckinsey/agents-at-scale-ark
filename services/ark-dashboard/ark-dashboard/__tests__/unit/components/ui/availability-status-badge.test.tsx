import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';

describe('AvailabilityStatusBadge', () => {
  it('should render Available status for True value', () => {
    render(<AvailabilityStatusBadge status="True" />);
    
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('should render Unavailable status for False value', () => {
    render(<AvailabilityStatusBadge status="False" />);
    
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('should render Unknown status for Unknown value', () => {
    render(<AvailabilityStatusBadge status="Unknown" />);
    
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('should render Unknown status when status is null', () => {
    render(<AvailabilityStatusBadge status={null} />);
    
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('should render Unknown status when status is undefined', () => {
    render(<AvailabilityStatusBadge />);
    
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('should render as a link when eventsLink is provided', () => {
    render(
      <AvailabilityStatusBadge 
        status="True" 
        eventsLink="/events?kind=MCPServer&name=test&page=1" 
      />
    );
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/events?kind=MCPServer&name=test&page=1');
    expect(link).toHaveAttribute('title', 'View events');
    expect(link).toHaveTextContent('Available');
  });

  it('should not render as a link when eventsLink is not provided', () => {
    render(<AvailabilityStatusBadge status="True" />);
    
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('should apply correct styling classes for Available status', () => {
    const { container } = render(<AvailabilityStatusBadge status="True" />);
    
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('bg-green-100', 'text-green-800', 'hover:bg-green-200');
  });

  it('should apply correct styling classes for Unavailable status', () => {
    const { container } = render(<AvailabilityStatusBadge status="False" />);
    
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('bg-red-100', 'text-red-800', 'hover:bg-red-200');
  });

  it('should apply correct styling classes for Unknown status', () => {
    const { container } = render(<AvailabilityStatusBadge status="Unknown" />);
    
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800', 'hover:bg-gray-200');
  });

  it('should apply custom className when provided', () => {
    const { container } = render(
      <AvailabilityStatusBadge status="True" className="custom-class" />
    );
    
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('custom-class');
  });

  it('should apply custom className with link', () => {
    const { container } = render(
      <AvailabilityStatusBadge 
        status="True" 
        eventsLink="/events" 
        className="custom-class" 
      />
    );
    
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('custom-class');
  });
});
