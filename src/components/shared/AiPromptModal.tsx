/**
 * AI Format Suffix Modal for takemock.
 *
 * Implements the streamlined, frictionless workflow:
 * - User has their own conversation/prompt in ChatGPT, Claude, DeepSeek, Gemini, or Ollama.
 * - This dialog provides the exact format contract suffix to append to that request.
 * - Users can select/deselect question types to tailor the format instructions.
 * - 1-Click copy to clipboard.
 * - Response is pasted directly into the main Custom Designer code editor.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  FileCode2,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import {
  buildLlmFormatSuffix,
  buildLlmSystemPrompt,
  SUPPORTED_QUESTION_TYPES,
  type GenerationTarget,
  type OutputFormat,
} from '@/core/ai/promptHelper';

export interface AiPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTarget?: GenerationTarget;
}

export function AiPromptModal({ isOpen, onClose, defaultTarget = 'QUESTION_PACK' }: AiPromptModalProps) {
  const [target, setTarget] = useState<GenerationTarget>(defaultTarget);
  const [format, setFormat] = useState<OutputFormat>('MARKDOWN');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    'single_choice',
    'multiple_choice',
    'numerical',
  ]);
  const [copiedType, setCopiedType] = useState<'SUFFIX' | 'SYSTEM' | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleType = (typeId: string) => {
    setSelectedTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId]
    );
  };

  const selectAllTypes = () => {
    setSelectedTypes(SUPPORTED_QUESTION_TYPES.map((t) => t.id));
  };

  const clearTypes = () => {
    setSelectedTypes([]);
  };

  const suffix = useMemo(() => {
    return buildLlmFormatSuffix(
      format,
      selectedTypes.length > 0 ? selectedTypes : undefined,
      target
    );
  }, [format, selectedTypes, target]);

  const systemPrompt = useMemo(() => {
    return buildLlmSystemPrompt(format, target);
  }, [format, target]);

  const handleCopy = (text: string, type: 'SUFFIX' | 'SYSTEM') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-prompt-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl bg-card/95 backdrop-blur-xl text-card-foreground rounded-3xl shadow-2xl border border-border/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-base-200/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-content shadow-md shadow-primary/20">
              <Bot className="size-5" />
            </div>
            <div>
              <h2 id="ai-prompt-modal-title" className="text-base font-bold tracking-tight">
                AI Prompt Helper
              </h2>
              <p className="text-xs text-base-content/60">
                Append this suffix to ChatGPT, Claude, Gemini, or DeepSeek to format questions automatically.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="btn btn-sm btn-circle btn-ghost text-base-content/60 hover:text-base-content active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Format & Question Types Controls */}
          <div className="p-4 rounded-2xl border border-border/60 bg-base-200/40 space-y-3.5">
            {/* Target Selection: Question Pack vs Full Exam Paper */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-base-content/70 block">
                  Target Scope
                </span>
                <span className="text-[11px] text-base-content/50">
                  Select whether you need a full timed exam paper or a question pack.
                </span>
              </div>

              {/* Apple Segmented Control */}
              <div className="bg-base-200/80 p-0.5 rounded-lg border border-border/60 flex items-center">
                <button
                  type="button"
                  onClick={() => setTarget('QUESTION_PACK')}
                  className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${
                    target === 'QUESTION_PACK'
                      ? 'bg-primary text-primary-content shadow-xs'
                      : 'text-base-content/70 hover:text-base-content hover:bg-base-300/40'
                  }`}
                >
                  🧩 Question Pack
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('FULL_PAPER')}
                  className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${
                    target === 'FULL_PAPER'
                      ? 'bg-primary text-primary-content shadow-xs'
                      : 'text-base-content/70 hover:text-base-content hover:bg-base-300/40'
                  }`}
                >
                  📄 Full Paper
                </button>
              </div>
            </div>

            {/* Format Selection: Markdown v2 vs JSON */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-base-content/70 block">
                  Output Format
                </span>
                <span className="text-[11px] text-base-content/50">
                  Markdown v2 is easiest for LLMs; JSON provides strict key-value pairs.
                </span>
              </div>

              {/* Apple Segmented Control */}
              <div className="bg-base-200/80 p-0.5 rounded-lg border border-border/60 flex items-center">
                <button
                  type="button"
                  onClick={() => setFormat('MARKDOWN')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-semibold transition-all ${
                    format === 'MARKDOWN'
                      ? 'bg-primary text-primary-content shadow-xs'
                      : 'text-base-content/70 hover:text-base-content hover:bg-base-300/40'
                  }`}
                >
                  <FileCode2 className="size-3.5" />
                  Markdown v2
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('JSON')}
                  className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${
                    format === 'JSON'
                      ? 'bg-secondary text-secondary-content shadow-xs'
                      : 'text-base-content/70 hover:text-base-content hover:bg-base-300/40'
                  }`}
                >
                  {target === 'FULL_PAPER' ? 'JSON Object' : 'JSON Array'}
                </button>
              </div>
            </div>

            {/* Question Types Selection */}
            <div className="space-y-2 pt-2 border-t border-base-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase text-base-content/70 block">
                    Supported Question Types in Suffix
                  </span>
                  <span className="text-[11px] text-base-content/50">
                    Tailors rules and examples shown in the prompt contract.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllTypes}
                    className="text-[11px] link link-primary font-semibold"
                  >
                    Select All
                  </button>
                  <span className="text-base-content/30">•</span>
                  <button
                    type="button"
                    onClick={clearTypes}
                    className="text-[11px] link link-hover text-base-content/60"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {SUPPORTED_QUESTION_TYPES.map((t) => {
                  const isSelected = selectedTypes.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleType(t.id)}
                      className={`badge badge-md gap-1.5 py-3 px-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'badge-primary text-primary-content font-bold shadow-xs'
                          : 'badge-outline text-base-content/60 hover:text-base-content'
                      }`}
                    >
                      {isSelected && <Check className="size-3" />}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Suffix Preview Box */}
          <div className="space-y-2.5 bg-base-200/60 p-4 rounded-2xl border border-border/60">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-base-content/70">
                Format Instructions Suffix:
              </span>
              <span className="badge badge-sm badge-neutral font-mono">{suffix.length} chars</span>
            </div>

            <textarea
              readOnly
              rows={8}
              value={suffix}
              aria-label="Format instructions suffix"
              className="textarea textarea-bordered w-full font-mono text-[11px] leading-relaxed bg-base-100 resize-none selectable-content"
            />
          </div>

          {/* Direct Workflow Tip */}
          <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-base-content/80 flex items-start gap-2.5">
            <Zap className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold text-primary block mb-0.5">Instructions</span>
              Append this suffix to your prompt in ChatGPT, Claude, Gemini, or DeepSeek.
              Paste the AI's response into the <b>Builder</b> editor, and Takemock will parse the questions, options, and formulas automatically.
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="px-6 py-4 border-t border-border/60 bg-base-200/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleCopy(systemPrompt, 'SYSTEM')}
            title="Copy system prompt for custom GPTs, Claude Projects, or Ollama"
            className="btn btn-sm btn-outline border-border/60 gap-1.5 font-semibold text-xs active:scale-95"
          >
            {copiedType === 'SYSTEM' ? (
              <>
                <Check className="size-3.5 text-success" /> Copied System Prompt
              </>
            ) : (
              <>
                <Terminal className="size-3.5" /> Copy System Prompt
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-ghost font-semibold active:scale-95"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() => handleCopy(suffix, 'SUFFIX')}
              className="btn btn-sm btn-primary gap-1.5 font-bold shadow-xs text-xs active:scale-95"
            >
              {copiedType === 'SUFFIX' ? (
                <>
                  <Check className="size-4 text-success-content" />
                  Copied Suffix
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy Format Suffix
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
