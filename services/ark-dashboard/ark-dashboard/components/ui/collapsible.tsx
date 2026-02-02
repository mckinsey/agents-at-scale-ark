'use client';

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

interface CollapsibleTriggerProps extends React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger> {
  open?: boolean;
  showChevron?: boolean;
  isActive?: boolean;
}

function CollapsibleTrigger({
  open,
  showChevron = false,
  isActive = false,
  className,
  ...props
}: CollapsibleTriggerProps) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      data-active={isActive}
      className={cn(
        'group/collapsible-trigger',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
        className
      )}
      {...props}
    >
      {props.children}
      {showChevron && (
        <>
          <ChevronUp className="ml-auto transition-all group-data-[state=open]/collapsible:block group-data-[state=closed]/collapsible:hidden" />
          <ChevronDown className="ml-auto transition-all opacity-0 group-hover/collapsible-trigger:opacity-100 group-data-[state=open]/collapsible:hidden group-data-[state=closed]/collapsible:block" />
        </>
      )}
      {!showChevron && open !== undefined && (
        <>
          {open ? (
            <ChevronUp className="ml-auto transition-all" />
          ) : (
            <ChevronDown className="ml-auto transition-all opacity-0 group-hover/collapsible-trigger:opacity-100" />
          )}
        </>
      )}
    </CollapsiblePrimitive.CollapsibleTrigger>
  );
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      style={{
        marginLeft: '32px'
      }}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
