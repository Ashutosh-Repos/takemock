/**
 * AI Format Suffix Modal for TakeMock.
 *
 * Implements the streamlined, frictionless workflow:
 * - User writes their own natural-language prompt in ChatGPT, Claude, Gemini, DeepSeek, or Ollama.
 * - This dialog provides the exact format contract suffix to append to the prompt.
 * - Uses native macOS desktop components (SegmentedControl, desktop buttons, keycaps).
 * - Styled consistently with native macOS dialogs (Liquid Glass, refined typography, subtle chips).
 */

import * as React from 'react';
import { Bot, Check, Copy, X, Sparkles, BookOpen, Layers } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  buildLlmFormatSuffix,
  SUPPORTED_QUESTION_TYPES,
  type GenerationTarget,
  type OutputFormat,
} from '@/core/ai/promptHelper';

export interface AiPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTarget?: GenerationTarget;
}

export function AiPromptModal({
  isOpen,
  onClose,
  defaultTarget = 'QUESTION_PACK',
}: AiPromptModalProps) {
  const [target, setTarget] = React.useState<GenerationTarget>(defaultTarget);
  const [format, setFormat] = React.useState<OutputFormat>('MARKDOWN');
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([
    'single_choice',
    'multiple_choice',
    'numerical',
  ]);
  const [copied, setCopied] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Sync default target when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setTarget(defaultTarget);
      setCopied(false);
    }
  }, [isOpen, defaultTarget]);

  const toggleType = (typeId: string) => {
    setSelectedTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId],
    );
  };

  const selectAllTypes = () => {
    setSelectedTypes(SUPPORTED_QUESTION_TYPES.map((t) => t.id));
  };

  const selectStandardTypes = () => {
    setSelectedTypes(['single_choice', 'multiple_choice', 'numerical']);
  };

  const clearTypes = () => {
    setSelectedTypes([]);
  };

  const suffix = React.useMemo(() => {
    return buildLlmFormatSuffix(
      format,
      selectedTypes.length > 0 ? selectedTypes : undefined,
      target,
    );
  }, [format, selectedTypes, target]);

  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(suffix);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [suffix]);

  // Keyboard navigation: Escape to close, ⌘+Enter to copy
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCopy();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleCopy]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden px-4 pt-[14vh] pb-6 select-none sm:pt-[16vh]">
      {/* Blurred Backdrop */}
      <div
        className="animate-in fade-in fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity duration-150"
        onClick={onClose}
      />

      {/* Spotlight Window Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-prompt-suffix-title"
        className="animate-in zoom-in-95 relative flex max-h-[75vh] w-full max-w-4xl flex-col gap-3 bg-transparent transition-all duration-180"
      >
        {/* Card 1: Spotlight Floating Header Bar */}
        <div className="border-border/80 bg-card/85 flex h-14 shrink-0 items-center justify-between border px-4 opacity-60 shadow-2xl backdrop-blur-3xl sm:h-15 sm:px-5 dark:bg-[#1c1c1e]/85">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
              <Bot className="size-4" />
            </div>
            <span
              id="ai-prompt-suffix-title"
              className="text-foreground text-sm font-semibold tracking-tight sm:text-[15px]"
            >
              AI Prompt Suffix
            </span>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="bg-card/90 text-foreground border-border/70 hidden h-5 min-w-5 items-center justify-center rounded border px-1.5 font-mono text-[10px] font-semibold shadow-2xs sm:inline-flex">
              esc
            </kbd>
            <button
              type="button"
              onClick={onClose}
              className="macos-toolbar-btn text-muted-foreground hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
              title="Close (Esc)"
              aria-label="Close modal"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Card 2: Spotlight Companion Inspector & Preview Card */}
        <div className="border-border/80 bg-card/85 flex max-h-[60vh] w-full flex-col overflow-hidden rounded-2xl border opacity-65 shadow-2xl backdrop-blur-3xl dark:bg-[#1c1c1e]/85">
          {/* Scrollable Content */}
          <div className="macos-scrollbar flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {/* Controls: Target Scope, Format & Question Types */}
            <div className="card border-border/70 space-y-3 p-3 sm:p-3.5">
              {/* Scope & Format Row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Target Scope:
                  </span>
                  <SegmentedControl
                    value={target}
                    onValueChange={(val) => setTarget(val as GenerationTarget)}
                    size="sm"
                    options={[
                      { value: 'QUESTION_PACK', label: 'Question Pack', icon: Layers },
                      { value: 'FULL_PAPER', label: 'Full Paper', icon: BookOpen },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Format:
                  </span>
                  <SegmentedControl
                    value={format}
                    onValueChange={(val) => setFormat(val as OutputFormat)}
                    size="sm"
                    options={[
                      { value: 'MARKDOWN', label: 'Markdown v2' },
                      { value: 'JSON', label: 'JSON' },
                    ]}
                  />
                </div>
              </div>

              {/* Included Types Selector */}
              <div className="border-border/40 space-y-2 border-t pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Included Question Types ({selectedTypes.length}/
                    {SUPPORTED_QUESTION_TYPES.length})
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={selectAllTypes}
                      className="btn btn-xs btn-ghost text-primary font-medium"
                    >
                      All (9)
                    </button>
                    <span className="text-muted-foreground/30">•</span>
                    <button
                      type="button"
                      onClick={selectStandardTypes}
                      className="btn btn-xs btn-ghost text-primary font-medium"
                    >
                      Standard (3)
                    </button>
                    <span className="text-muted-foreground/30">•</span>
                    <button
                      type="button"
                      onClick={clearTypes}
                      className="btn btn-xs btn-ghost text-muted-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {SUPPORTED_QUESTION_TYPES.map((t) => {
                    const isSelected = selectedTypes.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleType(t.id)}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all select-none ${
                          isSelected
                            ? 'bg-primary/12 text-primary border-primary/35 hover:bg-primary/18 shadow-2xs'
                            : 'bg-card/60 text-muted-foreground border-border/70 hover:bg-card hover:text-foreground shadow-2xs'
                        }`}
                      >
                        {isSelected && <Check className="text-primary size-3 stroke-[2.5]" />}
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Suffix Preview Section */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Format Contract Preview
                </span>
                <span className="bg-muted/60 border-border/50 text-muted-foreground rounded-md border px-2 py-0.5 font-mono text-[10px]">
                  {suffix.length} characters
                </span>
              </div>

              <textarea
                ref={textareaRef}
                readOnly
                rows={9}
                value={suffix}
                aria-label="Format contract suffix preview"
                className="bg-background/50 border-border/70 text-foreground macos-scrollbar min-h-80 w-full resize-none rounded-xl border p-3 font-mono text-[11.5px] leading-relaxed select-text focus:outline-none dark:bg-black/40"
              />
            </div>

            {/* Workflow Guidance Callout */}
            <div className="bg-primary/6 border-primary/15 text-muted-foreground flex items-start gap-2.5 rounded-xl border p-3 text-xs">
              <Sparkles className="text-primary mt-0.5 size-4 shrink-0" />
              <div className="text-[11.5px] leading-relaxed">
                <span className="text-foreground mb-0.5 block font-semibold">Workflow</span>
                Append this suffix to your prompt in ChatGPT, Claude, Gemini, DeepSeek, or any LLM.
                Paste the generated output into the <b>Builder</b> editor, and TakeMock will
                automatically parse all questions, options, and math formulas.
              </div>
            </div>
          </div>

          {/* Native macOS Bottom Footer */}
          <div className="border-border/40 bg-muted/20 text-muted-foreground flex h-11 shrink-0 items-center justify-between border-t px-4 text-[11px] select-none sm:px-5">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="py-0.2 bg-card/80 border-border/60 text-foreground rounded border px-1 font-mono text-[9px]">
                  esc
                </kbd>
                <span className="text-[10.5px]">Close</span>
              </span>
              <span className="flex items-center gap-1 sm:inline-flex">
                <kbd className="py-0.2 bg-card/80 border-border/60 text-foreground rounded border px-1 font-mono text-[9px]">
                  ⌘↵
                </kbd>
                <span className="text-[10.5px]">Copy</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
                Close
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-sm btn-primary font-semibold"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5" />
                    <span>Copied Suffix!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>Copy Format Suffix</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
