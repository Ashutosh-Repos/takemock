import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { cn } from '@/lib/utils';

export interface SwitchProps
  extends Omit<React.ComponentPropsWithoutRef<typeof BaseSwitch.Root>, 'size'> {
  size?: 'regular' | 'mini';
  variant?: 'success' | 'accent';
  label?: React.ReactNode;
  description?: React.ReactNode;
  labelPlacement?: 'leading' | 'trailing';
}

export const Switch = React.forwardRef<HTMLSpanElement, SwitchProps>(
  (
    {
      className,
      size = 'regular',
      variant = 'accent',
      label,
      description,
      labelPlacement = 'trailing',
      disabled,
      id: explicitId,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const switchId = explicitId || generatedId;

    const switchElement = (
      <BaseSwitch.Root
        ref={ref}
        id={switchId}
        disabled={disabled}
        className={cn(
          'macos-switch-root',
          size === 'mini' ? 'macos-switch-mini' : 'macos-switch-regular',
          variant === 'accent' && 'macos-switch-accent',
          className
        )}
        {...props}
      >
        <BaseSwitch.Thumb className="macos-switch-thumb" />
      </BaseSwitch.Root>
    );

    if (!label && !description) {
      return switchElement;
    }

    return (
      <label
        htmlFor={switchId}
        className={cn(
          'inline-flex items-center gap-2.5 cursor-pointer select-none text-sm',
          disabled && 'opacity-50 cursor-not-allowed',
          labelPlacement === 'leading' && 'flex-row-reverse justify-between'
        )}
      >
        {switchElement}
        <div className="flex flex-col">
          {label && <span className="font-medium text-foreground tracking-tight">{label}</span>}
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
      </label>
    );
  }
);

Switch.displayName = 'Switch';
