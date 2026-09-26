import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils';

export const Tabs = BaseTabs.Root;

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof BaseTabs.List> {
  size?: 'sm' | 'regular' | 'lg';
  variant?: 'content' | 'toolbar';
}

export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, size = 'regular', variant = 'content', children, ...props }, ref) => (
    <BaseTabs.List
      ref={ref}
      className={cn(
        'macos-segmented',
        size === 'sm' && 'macos-segmented-sm',
        size === 'lg' && 'macos-segmented-lg',
        variant === 'toolbar' && 'macos-segmented-toolbar',
        className
      )}
      {...props}
    >
      {children}
      <BaseTabs.Indicator className="macos-segment-indicator" />
    </BaseTabs.List>
  )
);
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Tab>
>(({ className, ...props }, ref) => (
  <BaseTabs.Tab
    ref={ref}
    className={cn('macos-segment-item', className)}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Panel>
>(({ className, ...props }, ref) => (
  <BaseTabs.Panel
    ref={ref}
    className={cn('focus-visible:outline-none mt-2', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
