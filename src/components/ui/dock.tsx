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
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

const DEFAULT_MAGNIFICATION = 80;
const DEFAULT_DISTANCE = 150;
const DEFAULT_PANEL_HEIGHT = 64;

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
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
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
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Determine smart placement:
  // Desktop defaults to 'left' (vertical on left screen edge)
  // Mobile defaults to 'bottom' (horizontal on bottom screen edge)
  const effectivePlacement: 'right' | 'left' | 'bottom' | 'top' = useMemo(() => {
    if (placement && placement !== 'auto') return placement;
    if (direction === 'vertical') return 'left';
    if (direction === 'horizontal') return 'bottom';
    return isDesktop ? 'left' : 'bottom';
  }, [placement, direction, isDesktop]);

  const isVertical = effectivePlacement === 'right' || effectivePlacement === 'left';

  // Global window pointer listener ensures that even if pointer rapidly leaves
  // during a view-transition animation or frame drops, the hover & pop state cleanly resets.
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (mousePos.get() === Infinity && isHovered.get() === 0) return;

      const el = toolbarRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const buffer = magnification + 24;

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
          container: 'top-1/2 right-2 -translate-y-1/2 flex-col items-end',
          toolbar: 'flex-col items-end gap-3 px-3 py-3',
        };
      case 'left':
        return {
          container: 'top-1/2 left-2 -translate-y-1/2 flex-col items-start',
          toolbar: 'flex-col items-start gap-3 px-3 py-3',
        };
      case 'top':
        return {
          container: 'top-2 left-1/2 -translate-x-1/2 flex-row items-start',
          toolbar: 'flex-row items-start gap-3 py-2 px-3',
        };
      case 'bottom':
      default:
        return {
          container: 'bottom-2 left-1/2 -translate-x-1/2 flex-row items-end',
          toolbar: 'flex-row items-end gap-3 py-2 px-3',
        };
    }
  }, [effectivePlacement]);

  return (
    <motion.div
      className={cn(
        position,
        'z-50 flex h-fit w-fit overflow-visible',
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
          'bg-card/85 text-card-foreground border-border/70 pointer-events-auto flex overflow-visible rounded-2xl border shadow-2xl backdrop-blur-xl transition-colors',
          layoutConfig.toolbar,
          className,
        )}
        style={{
          width: isVertical ? panelHeight : 'auto',
          height: isVertical ? 'auto' : panelHeight,
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

function DockItem({ children, className, onClick }: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);

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
    [40, magnification, 40],
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

  return (
    <motion.div
      ref={ref}
      onClick={onClick}
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
        'relative inline-flex shrink-0 items-center justify-center',
        originClass,
        className,
      )}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      {Children.map(children, (child) =>
        cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          size,
          width: size,
          isHovered,
          isVertical,
          placement,
        }),
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
          initial: { opacity: 0, x: 0 },
          animate: { opacity: 1, x: -8 },
          exit: { opacity: 0, x: 0 },
          positionClass: 'top-1/2 right-full mr-3 -translate-y-1/2',
        };
      case 'left':
        return {
          initial: { opacity: 0, x: 0 },
          animate: { opacity: 1, x: 8 },
          exit: { opacity: 0, x: 0 },
          positionClass: 'top-1/2 left-full ml-3 -translate-y-1/2',
        };
      case 'top':
        return {
          initial: { opacity: 0, y: 0 },
          animate: { opacity: 1, y: 8 },
          exit: { opacity: 0, y: 0 },
          positionClass: 'top-full left-1/2 mt-3 -translate-x-1/2',
        };
      case 'bottom':
      default:
        return {
          initial: { opacity: 0, y: 0 },
          animate: { opacity: 1, y: -8 },
          exit: { opacity: 0, y: 0 },
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
          transition={{ duration: 0.15 }}
          className={cn(
            'border-border/80 bg-popover text-popover-foreground pointer-events-none absolute w-fit rounded-lg border px-2.5 py-1 text-xs font-medium whitespace-pre shadow-lg backdrop-blur-md',
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

  const sizeTransform = useTransform(size, (val) => val / 2);

  return (
    <motion.div
      style={{
        width: sizeTransform,
        height: sizeTransform,
      }}
      className={cn('flex items-center justify-center', className)}
    >
      {children}
    </motion.div>
  );
}

export { Dock, DockIcon, DockItem, DockLabel };
