'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

import { cn } from '../../lib/utils';

// Types
export type TabSize = 'sm' | 'default' | 'lg';

export interface TabsTriggerProps extends React.ComponentProps<
  typeof TabsPrimitive.Trigger
> {
  size?: TabSize;
}

export type TabsContentProps = React.ComponentProps<
  typeof TabsPrimitive.Content
>;

export interface TabsProps extends React.ComponentProps<
  typeof TabsPrimitive.Root
> {
  size?: TabSize;
  hideBaseline?: boolean;
  padded?: boolean;
}

export type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List>;

// Size context for passing size to triggers
interface TabsSizeContextValue {
  size?: TabSize;
}

const TabsSizeContext = React.createContext<TabsSizeContextValue | undefined>(
  undefined,
);

const useTabsSizeContext = () => {
  const context = React.useContext(TabsSizeContext);

  return context;
};

// Layout context for passing hideBaseline and padded to list and triggers
interface TabsLayoutContextValue {
  hideBaseline?: boolean;
  padded?: boolean;
}

const TabsLayoutContext = React.createContext<
  TabsLayoutContextValue | undefined
>(undefined);

const useTabsLayoutContext = () => {
  const context = React.useContext(TabsLayoutContext);

  return context;
};

// Default styles based on Figma design
const defaultStyles = {
  tabs: 'w-full',
  tabList: {
    base: 'flex relative box-border',
    baseline:
      "before:absolute before:bottom-0 before:left-0 before:w-full before:h-px before:bg-stroke-tertiary before:content-['']",
    hideBaseline: 'before:content-none',
    compact: {
      sm: 'gap-3',
      default: 'gap-3',
      lg: 'gap-5',
    },
    scrollbar:
      'scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0',
  },
  tab: {
    base: 'box-border relative align-top text-center text-ellipsis overflow-visible inline-flex items-center justify-center gap-1 select-none outline-none transition-all duration-200',
    padding: {
      sm: 'px-3 py-2',
      default: 'px-4 pt-2 pb-3',
      lg: 'px-6 py-3',
    },
    paddingCompact: {
      sm: 'py-2',
      default: 'pt-2 pb-3',
      lg: 'py-3',
    },
    // Typography per size
    font: {
      sm: 'paragraph-regular-primary',
      default: 'label-large-primary',
      lg: 'headings-h4-regular',
    },
    // Animated hover border (expands from center)
    animatedHoverBorder:
      "after:absolute after:bottom-[-1px] after:left-0 after:h-px after:w-full after:bg-stroke-tertiary-hover after:content-[''] after:scale-x-0 after:origin-center after:transition-transform after:duration-200 data-[state=inactive]:hover:after:scale-x-100",
    // State: Inactive (1px bottom border)
    inactive: {
      border:
        'data-[state=inactive]:border-b data-[state=inactive]:border-b-stroke-tertiary',
      text: 'data-[state=inactive]:text-fg-secondary',
      cursor: 'data-[state=inactive]:cursor-pointer',
    },
    // State: Active/Selected (1px bottom border)
    active: {
      border:
        'data-[state=active]:border-b data-[state=active]:border-b-stroke-active',
      text: 'data-[state=active]:text-fg-primary',
      cursor: 'data-[state=active]:cursor-default',
    },
    // State: Focused (bottom-only border per Figma — NOT a ring/outline)
    focused: {
      color:
        'focus-visible:data-[state=inactive]:border-b-stroke-status-focus focus-visible:data-[state=active]:border-b-stroke-status-focus',
      widthLarge:
        'focus-visible:data-[state=inactive]:border-b-2 focus-visible:data-[state=active]:border-b-2',
      text: 'focus-visible:text-fg-primary',
    },
    // State: Disabled (1px bottom border)
    disabled: {
      border:
        'data-[disabled]:border-b data-[disabled]:border-b-stroke-tertiary',
      text: 'data-[disabled]:text-fg-disabled',
      cursor: 'data-[disabled]:cursor-not-allowed',
    },
  },
  tabPanel: {
    base: 'block py-5 text-fg-primary',
  },
};

// Components
function TabsRoot({
  children,
  className,
  size = 'default',
  hideBaseline = false,
  padded = true,
  ...props
}: TabsProps) {
  return (
    <TabsSizeContext.Provider value={{ size }}>
      <TabsLayoutContext.Provider value={{ hideBaseline, padded }}>
        <TabsPrimitive.Root
          data-slot="tabs"
          className={cn(defaultStyles.tabs, className)}
          {...props}>
          {children}
        </TabsPrimitive.Root>
      </TabsLayoutContext.Provider>
    </TabsSizeContext.Provider>
  );
}

function TabsList({ className, ...props }: TabsListProps) {
  const sizeContext = useTabsSizeContext();
  const size = sizeContext?.size ?? 'default';
  const layoutContext = useTabsLayoutContext();
  const hideBaseline = layoutContext?.hideBaseline ?? false;
  const padded = layoutContext?.padded ?? true;

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        defaultStyles.tabList.base,
        defaultStyles.tabList.scrollbar,
        !hideBaseline && defaultStyles.tabList.baseline,
        hideBaseline && defaultStyles.tabList.hideBaseline,
        !padded && defaultStyles.tabList.compact[size],
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  disabled,
  size: triggerSize,
  children,
  className,
  ...props
}: TabsTriggerProps) {
  const sizeContext = useTabsSizeContext();
  const size = triggerSize ?? sizeContext?.size ?? 'default';
  const layoutContext = useTabsLayoutContext();
  const hideBaseline = layoutContext?.hideBaseline ?? false;
  const padded = layoutContext?.padded ?? true;

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      disabled={disabled}
      data-disabled={disabled ? '' : undefined}
      className={cn(
        defaultStyles.tab.base,
        padded
          ? defaultStyles.tab.padding[size]
          : defaultStyles.tab.paddingCompact[size],
        defaultStyles.tab.font[size],
        // Disabled state (applied first to ensure it overrides)
        defaultStyles.tab.disabled.border,
        defaultStyles.tab.disabled.text,
        defaultStyles.tab.disabled.cursor,
        // Inactive state (only when not disabled)
        !disabled && defaultStyles.tab.inactive.border,
        !disabled && defaultStyles.tab.inactive.text,
        !disabled && defaultStyles.tab.inactive.cursor,
        // Active state (only when not disabled)
        !disabled && defaultStyles.tab.active.border,
        !disabled && defaultStyles.tab.active.text,
        !disabled && defaultStyles.tab.active.cursor,
        // Focus state (bottom-only border, 2px width for lg)
        defaultStyles.tab.focused.color,
        size === 'lg' && defaultStyles.tab.focused.widthLarge,
        defaultStyles.tab.focused.text,
        // Hide trigger borders when baseline is shown (hideBaseline === false)
        // Disable hover border and add animated hover border that expands from center
        !hideBaseline &&
          'data-[state=inactive]:border-b-transparent data-[state=inactive]:hover:border-b-transparent',
        // Enable animated hover border for all inactive tabs on hover
        !disabled && defaultStyles.tab.animatedHoverBorder,
        className,
      )}
      {...props}>
      {children}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(defaultStyles.tabPanel.base, className)}
      {...props}
    />
  );
}

export { TabsRoot as Tabs, TabsList, TabsTrigger, TabsContent };
