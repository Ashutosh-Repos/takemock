'use client';

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence,
} from 'framer-motion';
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_MAGNIFICATION = 70;
const DEFAULT_DISTANCE = 140;
const DEFAULT_BASE_SIZE = 44;
const DEFAULT_PANEL_HEIGHT = 56;

type DockPlacement = 'right' | 'left' | 'bottom' | 'top' | 'auto';

type DockProps = {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  distance?: number;
  panelHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
  direction?: 'horizontal' | 'vertical';
  position?: 'absolute' | 'fixed';
  placement?: DockPlacement;
};

type DockItemProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  'aria-label'?: string;
  'aria-current'?: boolean | 'page' | 'step' | 'location' | 'date' | 'time';
};

type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
};

type DockIconProps = {
  className?: string;
  children: React.ReactNode;
};

type DocContextType = {
  mouseX: MotionValue;
  mousePos: MotionValue;
  spring: SpringOptions;
  magnification: number;
  distance: number;
  isVertical: boolean;
  placement: 'right' | 'left' | 'bottom' | 'top';
};

type DockProviderProps = {
  children: React.ReactNode;
  value: DocContextType;
};

const DockContext = createContext<DocContextType | undefined>(undefined);

function DockProvider({ children, value }: DockProviderProps) {
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

function useDock() {
  const context = useContext(DockContext);
  if (!context) {
    throw new Error('useDock must be used within an DockProvider');
  }
  return context;
}

function Dock({
  children,
  className,
  containerClassName,
  spring = { mass: 0.1, stiffness: 175, damping: 14 },
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  panelHeight = DEFAULT_PANEL_HEIGHT,
  direction,
  position = 'fixed',
  placement = 'auto',
}: DockProps) {
  const mousePos = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const effectivePlacement: 'right' | 'left' | 'bottom' | 'top' = useMemo(() => {
    if (placement && placement !== 'auto') return placement;
    if (direction === 'vertical') return 'left';
    return 'bottom';
  }, [placement, direction]);

  const isVertical = effectivePlacement === 'right' || effectivePlacement === 'left';

  // Global window pointer listener to ensure hover and pop state cleanly resets
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (mousePos.get() === Infinity && isHovered.get() === 0) return;

      const el = toolbarRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const buffer = magnification + 32;

      const isInside =
        e.clientX >= rect.left - (effectivePlacement === 'right' ? buffer : 24) &&
        e.clientX <= rect.right + (effectivePlacement === 'left' ? buffer : 24) &&
        e.clientY >= rect.top - (effectivePlacement === 'bottom' ? buffer : 24) &&
        e.clientY <= rect.bottom + (effectivePlacement === 'top' ? buffer : 24);

      if (!isInside) {
        mousePos.set(Infinity);
        isHovered.set(0);
      }
    };

    const handleWindowLeave = () => {
      mousePos.set(Infinity);
      isHovered.set(0);
    };

    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: true });
    window.addEventListener('pointerleave', handleWindowLeave);
    window.addEventListener('blur', handleWindowLeave);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerleave', handleWindowLeave);
      window.removeEventListener('blur', handleWindowLeave);
    };
  }, [effectivePlacement, magnification, mousePos, isHovered]);

  const layoutConfig = useMemo(() => {
    switch (effectivePlacement) {
      case 'right':
        return {
          container: 'top-1/2 right-3 -translate-y-1/2 flex-col items-end',
          toolbar: 'flex-col items-center gap-2 p-2',
        };
      case 'left':
        return {
          container: 'top-1/2 left-3 -translate-y-1/2 flex-col items-start',
          toolbar: 'flex-col items-center gap-2 p-2',
        };
      case 'top':
        return {
          container: 'top-3 left-1/2 -translate-x-1/2 flex-row items-start',
          toolbar: 'flex-row items-start gap-2.5 px-3.5 py-2',
        };
      case 'bottom':
      default:
        return {
          container: 'bottom-3 left-1/2 -translate-x-1/2 flex-row items-end',
          toolbar: 'flex-row items-end gap-2.5 px-3 pb-2 pt-2.5',
        };
    }
  }, [effectivePlacement]);

  return (
    <motion.div
      className={cn(
        position,
        'z-50 flex h-fit w-fit overflow-visible select-none',
        layoutConfig.container,
        containerClassName,
      )}
    >
      <motion.div
        ref={toolbarRef}
        onPointerMove={({ clientX, clientY }) => {
          isHovered.set(1);
          mousePos.set(isVertical ? clientY : clientX);
        }}
        onPointerLeave={() => {
          isHovered.set(0);
          mousePos.set(Infinity);
        }}
        className={cn(
          'macos-liquid-dock pointer-events-auto flex overflow-visible rounded-[24px] text-foreground transition-colors',
          layoutConfig.toolbar,
          className,
        )}
        style={{
          width: isVertical ? panelHeight : 'auto',
          minHeight: isVertical ? 'auto' : panelHeight,
        }}
        role="toolbar"
        aria-label="Application dock"
      >
        <DockProvider
          value={{
            mouseX: mousePos,
            mousePos,
            spring,
            distance,
            magnification,
            isVertical,
            placement: effectivePlacement,
          }}
        >
          {children}
        </DockProvider>
      </motion.div>
    </motion.div>
  );
}

function DockItem({
  children,
  className,
  onClick,
  isActive = false,
  ...restProps
}: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isBouncing, setIsBouncing] = useState(false);

  const { distance, magnification, mousePos, spring, isVertical, placement } = useDock();
  const isHovered = useMotionValue(0);

  // Sync item hover and focus states whenever mouse leaves the dock entirely
  useEffect(() => {
    const unsubscribe = mousePos.on('change', (val) => {
      if (val === Infinity) {
        isHovered.set(0);
        if (ref.current && ref.current.contains(document.activeElement)) {
          (document.activeElement as HTMLElement)?.blur();
        }
      }
    });
    return () => unsubscribe();
  }, [mousePos, isHovered]);

  const mouseDistance = useTransform(mousePos, (val) => {
    if (val === Infinity) return Infinity;

    const domRect = ref.current?.getBoundingClientRect();
    if (!domRect) return Infinity;

    if (isVertical) {
      const center = domRect.top + domRect.height / 2;
      return val - center;
    }

    const center = domRect.left + domRect.width / 2;
    return val - center;
  });

  const sizeTransform = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [DEFAULT_BASE_SIZE, magnification, DEFAULT_BASE_SIZE],
    { clamp: true }
  );

  const size = useSpring(sizeTransform, spring);

  const originClass = useMemo(() => {
    switch (placement) {
      case 'right':
        return 'origin-right';
      case 'left':
        return 'origin-left';
      case 'top':
        return 'origin-top';
      case 'bottom':
      default:
        return 'origin-bottom';
    }
  }, [placement]);

  const handleClick = () => {
    setIsBouncing(true);
    setTimeout(() => setIsBouncing(false), 500);
    onClick?.();
  };

  const isCurrent = isActive || restProps['aria-current'] === 'page';

  return (
    <motion.div
      ref={ref}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      animate={isBouncing ? { y: [0, -12, 0, -5, 0] } : { y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      style={{
        width: size,
        height: size,
      }}
      onHoverStart={() => {
        if (mousePos.get() !== Infinity) {
          isHovered.set(1);
        }
      }}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) {
          isHovered.set(1);
        }
      }}
      onBlur={() => isHovered.set(0)}
      className={cn(
        'group relative inline-flex shrink-0 cursor-pointer items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        originClass,
        className,
      )}
      tabIndex={0}
      role="button"
      aria-label={restProps['aria-label']}
      aria-current={isCurrent ? 'page' : undefined}
      aria-haspopup="true"
    >
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        return cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          size,
          width: size,
          isHovered,
          isVertical,
          placement,
          isActive: isCurrent,
        });
      })}

      {/* Apple Running / Active Indicator Dot */}
      {isCurrent && (
        <motion.span
          layoutId="dock-active-dot"
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-foreground/80 dark:bg-foreground/90 shadow-[0_0_4px_rgba(255,255,255,0.7)] pointer-events-none"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
    </motion.div>
  );
}

function DockLabel({ children, className, ...rest }: DockLabelProps) {
  const restProps = rest as Record<string, unknown>;
  const isHovered = restProps['isHovered'] as MotionValue<number>;
  const { placement } = useDock();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', (latest) => {
      setIsVisible(latest === 1);
    });

    return () => unsubscribe();
  }, [isHovered]);

  const tooltipConfig = useMemo(() => {
    switch (placement) {
      case 'right':
        return {
          initial: { opacity: 0, x: 4, scale: 0.95 },
          animate: { opacity: 1, x: -8, scale: 1 },
          exit: { opacity: 0, x: 2, scale: 0.95 },
          positionClass: 'top-1/2 right-full mr-3 -translate-y-1/2',
        };
      case 'left':
        return {
          initial: { opacity: 0, x: -4, scale: 0.95 },
          animate: { opacity: 1, x: 8, scale: 1 },
          exit: { opacity: 0, x: -2, scale: 0.95 },
          positionClass: 'top-1/2 left-full ml-3 -translate-y-1/2',
        };
      case 'top':
        return {
          initial: { opacity: 0, y: -4, scale: 0.95 },
          animate: { opacity: 1, y: 8, scale: 1 },
          exit: { opacity: 0, y: -2, scale: 0.95 },
          positionClass: 'top-full left-1/2 mt-3 -translate-x-1/2',
        };
      case 'bottom':
      default:
        return {
          initial: { opacity: 0, y: 4, scale: 0.95 },
          animate: { opacity: 1, y: -8, scale: 1 },
          exit: { opacity: 0, y: 2, scale: 0.95 },
          positionClass: 'bottom-full left-1/2 mb-3 -translate-x-1/2',
        };
    }
  }, [placement]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={tooltipConfig.initial}
          animate={tooltipConfig.animate}
          exit={tooltipConfig.exit}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className={cn(
            'pointer-events-none absolute z-50 w-fit select-none rounded-md px-2.5 py-1 text-[11px] font-medium tracking-tight whitespace-pre shadow-xl',
            'bg-neutral-900/85 text-white backdrop-blur-xl border border-white/15 dark:bg-black/85 dark:text-neutral-100 dark:border-white/20',
            tooltipConfig.positionClass,
            className,
          )}
          role="tooltip"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children, className, ...rest }: DockIconProps) {
  const restProps = rest as Record<string, unknown>;
  const size = (restProps['size'] || restProps['width']) as MotionValue<number>;

  const sizeTransform = useTransform(size, (val) => (val ? val * 0.58 : 24));

  return (
    <motion.div
      style={{
        width: sizeTransform,
        height: sizeTransform,
      }}
      className={cn('flex items-center justify-center shrink-0 pointer-events-none', className)}
    >
      {children}
    </motion.div>
  );
}

function DockSeparator({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'mx-0.5 h-6 w-[1px] self-center rounded-full bg-white/25 dark:bg-white/12 shadow-[0_0_1px_rgba(0,0,0,0.15)] shrink-0',
        className
      )}
      role="separator"
      aria-orientation="vertical"
    />
  );
}

export { Dock, DockIcon, DockItem, DockLabel, DockSeparator };
