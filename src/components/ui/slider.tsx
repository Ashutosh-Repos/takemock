import * as React from 'react';
import { Slider as BaseSlider } from '@base-ui/react/slider';
import { cn } from '@/lib/utils';

export interface SliderProps {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number) => void;
  onValueCommitted?: (value: number) => void;
  disabled?: boolean;
  size?: 'regular' | 'sm';
  variant?: 'accent' | 'success';
  label?: React.ReactNode;
  minLabel?: React.ReactNode;
  maxLabel?: React.ReactNode;
  tickMarks?: boolean | number;
  showValueTooltip?: boolean;
  formatValue?: (val: number) => string;
  className?: string;
  id?: string;
  name?: string;
}

export const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      value,
      defaultValue,
      min = 0,
      max = 100,
      step = 1,
      onValueChange,
      onValueCommitted,
      disabled = false,
      size = 'regular',
      variant = 'accent',
      label,
      minLabel,
      maxLabel,
      tickMarks = false,
      showValueTooltip = false,
      formatValue,
      className,
      id,
      name,
    },
    ref
  ) => {
    const [currentVal, setCurrentVal] = React.useState<number>(
      value ?? defaultValue ?? min
    );
    const [isHovered, setIsHovered] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);

    // Sync state if controlled
    React.useEffect(() => {
      if (value !== undefined) {
        setCurrentVal(value);
      }
    }, [value]);

    const handleValueChange = (val: number | number[]) => {
      const num = Array.isArray(val) ? val[0] : val;
      setCurrentVal(num);
      onValueChange?.(num);
    };

    const handleValueCommitted = (val: number | number[]) => {
      const num = Array.isArray(val) ? val[0] : val;
      onValueCommitted?.(num);
    };

    // Calculate ticks if enabled
    const tickList = React.useMemo(() => {
      if (!tickMarks) return null;
      const count = typeof tickMarks === 'number' ? tickMarks : Math.min(Math.floor((max - min) / step) + 1, 21);
      if (count <= 1) return null;
      return Array.from({ length: count }, (_, i) => i);
    }, [tickMarks, min, max, step]);

    const displayValue = formatValue ? formatValue(currentVal) : currentVal;

    return (
      <div
        className={cn(
          'macos-slider-root',
          size === 'sm' && 'macos-slider-sm',
          variant === 'success' && 'macos-slider-success',
          disabled && 'is-disabled',
          className
        )}
      >
        {label && (
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span>{label}</span>
            <span className="font-mono text-muted-foreground tabular-nums text-[11px]">
              {displayValue}
            </span>
          </div>
        )}

        <BaseSlider.Root
          ref={ref}
          id={id}
          name={name}
          min={min}
          max={max}
          step={step}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          onValueChange={handleValueChange}
          onValueCommitted={handleValueCommitted}
          onPointerDown={() => setIsDragging(true)}
          onPointerUp={() => setIsDragging(false)}
          onPointerLeave={() => setIsDragging(false)}
          className="w-full"
        >
          <BaseSlider.Control
            className="macos-slider-control"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <BaseSlider.Track className="macos-slider-track">
              <BaseSlider.Indicator className="macos-slider-indicator" />
            </BaseSlider.Track>

            <BaseSlider.Thumb
              className={cn('macos-slider-thumb', isDragging && 'is-dragging')}
            >
              {showValueTooltip && (isHovered || isDragging) && (
                <div className="macos-slider-tooltip animate-in fade-in zoom-in-95 duration-100">
                  {displayValue}
                </div>
              )}
            </BaseSlider.Thumb>
          </BaseSlider.Control>
        </BaseSlider.Root>

        {tickList && (
          <div className="macos-slider-ticks" aria-hidden="true">
            {tickList.map((i) => (
              <div key={i} className="macos-slider-tick" />
            ))}
          </div>
        )}

        {(minLabel || maxLabel) && (
          <div className="macos-slider-labels">
            <span>{minLabel ?? min}</span>
            <span>{maxLabel ?? max}</span>
          </div>
        )}
      </div>
    );
  }
);

Slider.displayName = 'Slider';
