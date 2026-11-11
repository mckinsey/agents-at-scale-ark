'use client';

import { Rocket } from '@/components/icons';
import { Button } from '@/components/ui/button';

interface FloatingTourButtonProps {
  label: string;
  onClick: () => void;
}

export function FloatingTourButton({
  label,
  onClick,
}: Readonly<FloatingTourButtonProps>) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      className="animate-in fade-in slide-in-from-bottom-2 shadow-elevation-2 fixed right-6 bottom-6 z-40">
      <Rocket className="size-4" />
      {label}
    </Button>
  );
}
