import * as React from 'react';
import { X, Sliders, ToggleLeft, Layers, Volume2, Sun, Moon, Monitor, Bell, Shield, Sparkles } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTheme, type Theme } from '@/components/theme-provider';

export interface MacPreferencesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MacPreferencesModal({ open, onOpenChange }: MacPreferencesModalProps) {
  const { theme, setTheme } = useTheme();

  // Slider states
  const [volume, setVolume] = React.useState(65);
  const [brightness, setBrightness] = React.useState(80);
  const [steppedVal, setSteppedVal] = React.useState(25);

  // Switch states
  const [notifications, setNotifications] = React.useState(true);
  const [soundEffects, setSoundEffects] = React.useState(false);
  const [autoSave, setAutoSave] = React.useState(true);
  const [hapticFeedback, setHapticFeedback] = React.useState(true);

  // Segmented control state
  const [sampleSegment, setSampleSegment] = React.useState<'day' | 'week' | 'month'>('week');
  const [density, setDensity] = React.useState<'compact' | 'regular' | 'spacious'>('regular');

  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-150 animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* macOS Native Modal Window */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-xl rounded-xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-2xl transition-all duration-200 animate-in zoom-in-95 overflow-hidden"
      >
        {/* Titlebar */}
        <div
          data-tauri-drag-region
          className="flex h-11 items-center justify-between border-b border-border/60 px-4 bg-muted/30"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span id="modal-title" className="text-xs font-semibold tracking-tight text-foreground">
              macOS Native Component System
            </span>
          </div>

          <button
            onClick={() => onOpenChange(false)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close (Esc)"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* macOS System Appearance Control */}
        <div className="px-5 py-3 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <div className="text-xs font-semibold text-foreground">macOS System Appearance</div>
            <div className="text-[11px] text-muted-foreground">
              Syncs with macOS system light/dark mode in real time
            </div>
          </div>
          <SegmentedControl
            value={theme}
            onValueChange={(val) => setTheme(val as Theme)}
            size="sm"
            options={[
              { value: 'system', label: 'System', icon: Monitor },
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
            ]}
          />
        </div>

        {/* Modal Body with Base UI Tabs */}
        <div className="p-5">
          <Tabs
            defaultValue={
              (() => {
                try {
                  return new URLSearchParams(window.location.search).get('tab') || 'sliders';
                } catch {
                  return 'sliders';
                }
              })()
            }
          >
            <div className="flex justify-center mb-5">
              <TabsList size="regular">
                <TabsTrigger value="sliders" className="gap-1.5">
                  <Sliders className="size-3.5" />
                  <span>Sliders</span>
                </TabsTrigger>
                <TabsTrigger value="switches" className="gap-1.5">
                  <ToggleLeft className="size-3.5" />
                  <span>Switches</span>
                </TabsTrigger>
                <TabsTrigger value="segmented" className="gap-1.5">
                  <Layers className="size-3.5" />
                  <span>Tabs & Segments</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* TAB 1: SLIDERS */}
            <TabsContent value="sliders" className="space-y-5">
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    Native Slider with Transient Liquid Glass
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Click and drag the thumb. While active, the thumb takes on Apple's transient
                    Liquid Glass refraction and highlight.
                  </p>
                </div>

                {/* Regular Slider */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Volume2 className="size-3.5 text-muted-foreground" /> Output Volume
                    </span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {volume}%
                    </span>
                  </div>
                  <Slider
                    value={volume}
                    min={0}
                    max={100}
                    onValueChange={setVolume}
                    showValueTooltip
                    formatValue={(v) => `${v}%`}
                  />
                </div>

                {/* Small Slider with Ticks & Labels */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Sun className="size-3.5 text-muted-foreground" /> Display Brightness
                    </span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {brightness}%
                    </span>
                  </div>
                  <Slider
                    value={brightness}
                    min={0}
                    max={100}
                    size="sm"
                    tickMarks={5}
                    minLabel="Dim"
                    maxLabel="Max"
                    onValueChange={setBrightness}
                    showValueTooltip
                  />
                </div>

                {/* Stepped Slider */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Stepped Question Interval</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {steppedVal}s
                    </span>
                  </div>
                  <Slider
                    value={steppedVal}
                    min={5}
                    max={60}
                    step={5}
                    tickMarks={12}
                    size="sm"
                    variant="success"
                    onValueChange={setSteppedVal}
                    showValueTooltip
                    formatValue={(v) => `${v}s`}
                  />
                </div>

                {/* Disabled Slider */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs opacity-50">
                    <span className="font-medium text-foreground">Locked Balance (Disabled)</span>
                    <span className="font-mono text-xs tabular-nums">50</span>
                  </div>
                  <Slider value={50} min={0} max={100} disabled size="sm" />
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: SWITCHES */}
            <TabsContent value="switches" className="space-y-5">
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    Native macOS Switches (Toggles)
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Spring-animated sliding knobs with transient Liquid Glass elongation and specular rim when clicked.
                  </p>
                </div>

                <div className="space-y-3 divide-y divide-border/40">
                  {/* Regular Switch */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <Bell className="size-3.5 text-muted-foreground" /> Sound Notifications
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Play chime on timer completion and submission
                      </div>
                    </div>
                    <Switch
                      checked={notifications}
                      onCheckedChange={setNotifications}
                      size="regular"
                    />
                  </div>

                  {/* Mini Switch (Grouped forms) */}
                  <div className="flex items-center justify-between pt-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-foreground">
                        Mini Switch (Grouped Form Style)
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Compact 26px switch for dense inspector rows
                      </div>
                    </div>
                    <Switch
                      checked={soundEffects}
                      onCheckedChange={setSoundEffects}
                      size="mini"
                    />
                  </div>

                  {/* Accent-Colored Switch */}
                  <div className="flex items-center justify-between pt-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <Shield className="size-3.5 text-muted-foreground" /> Accent Color Variant
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Uses macOS system AccentColor instead of Apple Green
                      </div>
                    </div>
                    <Switch
                      checked={autoSave}
                      onCheckedChange={setAutoSave}
                      variant="accent"
                      size="regular"
                    />
                  </div>

                  {/* Combined Switch with Label */}
                  <div className="flex items-center justify-between pt-3">
                    <Switch
                      checked={hapticFeedback}
                      onCheckedChange={setHapticFeedback}
                      label="Haptic Feedback on Magic Trackpad"
                      description="Click sensation when snapping sliders"
                      size="mini"
                    />
                  </div>

                  {/* Disabled States */}
                  <div className="flex items-center justify-between pt-3">
                    <div className="text-xs text-muted-foreground">Disabled Switches</div>
                    <div className="flex items-center gap-3">
                      <Switch checked={false} disabled size="mini" />
                      <Switch checked={true} disabled size="mini" />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: SEGMENTED CONTROLS */}
            <TabsContent value="segmented" className="space-y-5">
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    Segmented Controls & Tabs
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Recessed track with an elevated white sliding pill that follows your selection with physics springs.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Standard Content Variant */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-foreground">
                      Standard Content Segmented Control
                    </div>
                    <SegmentedControl
                      value={sampleSegment}
                      onValueChange={setSampleSegment}
                      size="regular"
                      options={[
                        { value: 'day', label: 'Day' },
                        { value: 'week', label: 'Week' },
                        { value: 'month', label: 'Month' },
                      ]}
                    />
                  </div>

                  {/* Toolbar Variant (Translucent Liquid Glass) */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-foreground">
                      Toolbar Variant (Floating with Backdrop Blur)
                    </div>
                    <div className="p-3 rounded-lg bg-linear-to-r from-primary/10 via-purple-500/10 to-blue-500/10 border border-border/40">
                      <SegmentedControl
                        value={density}
                        onValueChange={setDensity}
                        variant="toolbar"
                        size="sm"
                        options={[
                          { value: 'compact', label: 'Compact' },
                          { value: 'regular', label: 'Regular' },
                          { value: 'spacious', label: 'Spacious' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2.5">
          <span className="text-[11px] text-muted-foreground font-mono">
            macOS HIG Compliant • Press ⌘, anytime
          </span>
          <button
            onClick={() => onOpenChange(false)}
            className="btn btn-sm btn-primary px-3 text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
