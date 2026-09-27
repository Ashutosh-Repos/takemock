import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  options: SegmentedControlOption<NoInfer<T>>[];
  size?: 'sm' | 'regular' | 'lg';
  variant?: 'content' | 'toolbar';
  equalWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  value: controlledValue,
  defaultValue,
  onValueChange,
  options,
  size = 'regular',
  variant = 'content',
  equalWidth,
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const [internalValue, setInternalValue] = React.useState<T>(
    defaultValue ?? (options[0]?.value as T),
  );

  const selectedValue = controlledValue !== undefined ? controlledValue : internalValue;
  const layoutId = React.useId();
  const cleanId = React.useMemo(() => layoutId.replace(/[^a-zA-Z0-9_-]/g, '_'), [layoutId]);

  const isIconOnly = options.length > 0 && options.every((o) => !o.label && Boolean(o.icon));
  const shouldEqualWidth = equalWidth ?? isIconOnly;

  const handleSelect = (val: T, disabled?: boolean) => {
    if (disabled) return;
    if (controlledValue === undefined) {
      setInternalValue(val);
    }
    (onValueChange as ((value: T) => void) | undefined)?.(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledOptions = options.filter((o) => !o.disabled);
    const currentIndex = enabledOptions.findIndex((o) => o.value === selectedValue);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % enabledOptions.length;
      handleSelect(enabledOptions[nextIndex].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + enabledOptions.length) % enabledOptions.length;
      handleSelect(enabledOptions[prevIndex].value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (enabledOptions.length > 0) handleSelect(enabledOptions[0].value);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (enabledOptions.length > 0) handleSelect(enabledOptions[enabledOptions.length - 1].value);
    }
  };

  const selectedIndex = options.findIndex((o) => o.value === selectedValue);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'macos-segmented shrink-0',
        size === 'sm' && 'macos-segmented-sm',
        size === 'lg' && 'macos-segmented-lg',
        variant === 'toolbar' && 'macos-segmented-toolbar',
        isIconOnly && 'macos-segmented-icon-only',
        shouldEqualWidth && 'macos-segmented-equal',
        className,
      )}
    >
      {options.map((option, idx) => {
        const isSelected = selectedValue === option.value;
        const Icon = option.icon;
        // Show divider only between two unselected adjacent items
        const showDivider = idx > 0 && idx !== selectedIndex && idx - 1 !== selectedIndex;

        return (
          <React.Fragment key={option.value}>
            {showDivider && <span className="macos-segment-divider" aria-hidden="true" />}
            <button
              role="tab"
              type="button"
              title={option.title}
              aria-selected={isSelected}
              disabled={option.disabled}
              data-disabled={option.disabled ? '' : undefined}
              data-active={isSelected ? '' : undefined}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => handleSelect(option.value, option.disabled)}
              onKeyDown={handleKeyDown}
              className={cn('macos-segment-item', isSelected && 'active')}
            >
              {/* Smooth animated sliding pill */}
              {isSelected && (
                <motion.div
                  layoutId={`segment-pill-${cleanId}`}
                  className="macos-segment-pill"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 38,
                  }}
                />
              )}

              {Icon && <Icon className="relative z-10 size-3.5 shrink-0" />}
              {Boolean(option.label) && <span className="relative z-10">{option.label}</span>}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
