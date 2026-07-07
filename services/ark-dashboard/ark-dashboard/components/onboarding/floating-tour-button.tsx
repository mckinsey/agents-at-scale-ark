'use client';

import { Rocket } from 'lucide-react';

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
      className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-6 right-6 z-40 shadow-elevation-2">
      <Rocket className="size-4" />
      {label}
    </Button>
  );
}
