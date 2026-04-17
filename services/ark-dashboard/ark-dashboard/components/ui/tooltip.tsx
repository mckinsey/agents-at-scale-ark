'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '../../lib/utils';

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  // Estimate if content will be multi-line based on text length
  // With max-w-[220px] and text-xs, roughly 30-35 chars per line
  const getTextContent = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getTextContent).join('');

    if (React.isValidElement(node)) {
      const nodeProps = node.props as { children?: React.ReactNode };

      if (nodeProps.children) {
        return getTextContent(nodeProps.children);
      }
    }

    return '';
  };

  const textContent = getTextContent(children);
  const estimatedCharsPerLine = 35; // approximate for max-w-[220px] and paragraph-small-primary
  const isMultiLine = textContent.length > estimatedCharsPerLine;

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-fill-primary text-fg-primary-inverse paragraph-small-primary animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 shadow-elevation-1 z-50 w-fit min-w-[36px] origin-(--radix-tooltip-content-transform-origin) text-balance',
          isMultiLine ? 'max-w-[220px] p-2' : 'max-w-[140px] p-1',
          className,
        )}
        {...props}>
        {children}
        <TooltipPrimitive.Arrow className="fill-fill-primary" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
