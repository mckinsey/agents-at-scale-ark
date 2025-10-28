import { Bot, type LucideIcon } from 'lucide-react';
import React from 'react';

export function getCustomIcon(
  iconAnnotation?: string,
  fallbackIcon: LucideIcon = Bot,
) {
  if (!iconAnnotation) {
    return fallbackIcon;
  }

  return function CustomIcon({ className }: { className?: string }) {
    return React.createElement('img', {
      src: iconAnnotation,
      className,
      alt: 'Custom icon',
    });
  };
}
