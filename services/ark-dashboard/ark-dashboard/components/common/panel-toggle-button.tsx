'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface PanelToggleButtonProps {
  readonly isCollapsed: boolean;
  readonly onToggle: () => void;
}

export function PanelToggleButton({
  isCollapsed,
  onToggle,
}: PanelToggleButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={`absolute top-1/2 z-10 h-12 w-6 -translate-y-1/2 rounded-l-none rounded-r-md border-l-0 px-0 transition-all duration-300 ${
        isCollapsed ? 'left-0' : 'left-1/2 -translate-x-px'
      }`}
      onClick={onToggle}
      title={isCollapsed ? 'Show configuration' : 'Hide configuration'}>
      {isCollapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
  );
}
