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

import { useMemo, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  FileCode2,
  Terminal,
  Zap,
} from 'lucide-react';
import {
  buildLlmFormatSuffix,
  buildLlmSystemPrompt,
  SUPPORTED_QUESTION_TYPES,
  type OutputFormat,
} from '@/core/ai/promptHelper';

export interface AiPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AiPromptModal({ isOpen, onClose }: AiPromptModalProps) {
  if (!isOpen) return null;

  const [format, setFormat] = useState<OutputFormat>('MARKDOWN');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    'single_choice',
    'multiple_choice',
    'numerical',
  ]);
  const [copiedType, setCopiedType] = useState<'SUFFIX' | 'SYSTEM' | null>(null);

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
      selectedTypes.length > 0 ? selectedTypes : undefined
    );
  }, [format, selectedTypes]);

  const systemPrompt = useMemo(() => {
    return buildLlmSystemPrompt(format);
  }, [format]);

  const handleCopy = (text: string, type: 'SUFFIX' | 'SYSTEM') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-base-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-base-100 rounded-3xl shadow-2xl border border-base-300 flex flex-col overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-200/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-content shadow-md shadow-primary/20">
              <Bot className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-base-content">
                  AI Format Contract Suffix
                </h2>
                <span className="badge badge-primary badge-sm font-semibold">Contract v2.0</span>
              </div>
              <p className="text-xs text-base-content/60">
                Append this suffix to your prompt in ChatGPT, Claude, DeepSeek, or Gemini to get
                strictly formatted questions.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-base-content/60 hover:text-base-content"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Format & Question Types Controls */}
          <div className="p-4 rounded-2xl border border-base-200 bg-base-200/40 space-y-3.5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase text-base-content/70 block">
                  Output Format
                </span>
                <span className="text-[11px] text-base-content/50">
                  Markdown v2 is easiest for LLMs; JSON provides strict key-value pairs.
                </span>
              </div>

              <div className="join">
                <button
                  type="button"
                  onClick={() => setFormat('MARKDOWN')}
                  className={`join-item btn btn-sm text-xs font-bold ${
                    format === 'MARKDOWN'
                      ? 'btn-primary shadow-xs'
                      : 'btn-outline border-base-300'
                  }`}
                >
                  <FileCode2 className="size-3.5" />
                  Markdown v2 (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('JSON')}
                  className={`join-item btn btn-sm text-xs font-bold ${
                    format === 'JSON'
                      ? 'btn-secondary text-secondary-content shadow-xs'
                      : 'btn-outline border-base-300'
                  }`}
                >
                  JSON Array
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
          <div className="space-y-2.5 bg-base-200/60 p-4 rounded-2xl border border-base-300">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase text-base-content/70">
                Authoritative Contract Suffix:
              </span>
              <span className="badge badge-sm badge-neutral font-mono">{suffix.length} chars</span>
            </div>

            <textarea
              readOnly
              rows={8}
              value={suffix}
              className="textarea textarea-bordered w-full font-mono text-[11px] leading-relaxed bg-base-100 resize-none selectable-content"
            />
          </div>

          {/* Direct Workflow Tip */}
          <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-base-content/80 flex items-start gap-2.5">
            <Zap className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-primary block">How to use:</span>
              Paste this suffix at the end of your prompt in ChatGPT, Claude, Gemini, or DeepSeek.
              When the AI responds, paste its output directly into the <b>Custom Designer code editor</b>.
              Takemock will automatically clean any code fences, greetings, or commentary!
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="px-6 py-4 border-t border-base-200 bg-base-200/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleCopy(systemPrompt, 'SYSTEM')}
            title="Copy system instructions for Custom GPTs, Claude Projects, or Ollama Modelfile"
            className="btn btn-sm btn-outline border-base-300 gap-1.5 font-semibold text-xs"
          >
            {copiedType === 'SYSTEM' ? (
              <>
                <Check className="size-3.5 text-success" /> Copied System Prompt!
              </>
            ) : (
              <>
                <Terminal className="size-3.5" /> Copy System Prompt
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn btn-sm btn-ghost font-semibold">
              Close
            </button>

            <button
              type="button"
              onClick={() => handleCopy(suffix, 'SUFFIX')}
              className="btn btn-sm btn-primary gap-1.5 font-bold shadow-xs text-xs"
            >
              {copiedType === 'SUFFIX' ? (
                <>
                  <Check className="size-4 text-success-content" />
                  Copied Suffix to Clipboard!
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
