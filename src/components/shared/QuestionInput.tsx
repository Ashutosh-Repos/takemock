/**
 * Interactive Question Input Component.
 * Dynamically renders the correct response input control for any canonical QuestionType.
 * Candidate-facing: adheres to Invariant 12 (never exposes answer keys).
 */

import React from 'react';
import type { QuestionModel, QuestionOption } from '@/types/question';
import { MathRenderer } from './MathRenderer';

interface QuestionInputProps {
  question: QuestionModel;
  response: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}

export const QuestionInput: React.FC<QuestionInputProps> = ({
  question,
  response,
  onChange,
  disabled = false,
}) => {
  // Option letter helper (A, B, C, D...)
  const getLetter = (index: number) => String.fromCharCode(65 + index);

  switch (question.type) {
    case 'single_choice':
    case 'image_based':
    case 'passage': {
      const options: QuestionOption[] = question.options || [];
      return (
        <div className="space-y-2">
          {options.map((opt, idx) => {
            const isSelected = response === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors active:scale-[0.995] ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-primary/40 text-foreground ring-1'
                    : 'border-border/70 bg-card hover:bg-muted/30 hover:border-border text-foreground'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name={`q_${question.id}`}
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => onChange(opt.id)}
                  disabled={disabled}
                  className="radio radio-primary radio-xs mt-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="border-border/60 bg-muted/40 text-muted-foreground mt-0.5 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium">
                      {getLetter(idx)}
                    </span>
                    <div className="selectable-content flex-1 text-xs leading-relaxed sm:text-sm">
                      <MathRenderer content={opt.text} />
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      );
    }

    case 'multiple_choice': {
      const options: QuestionOption[] = question.options || [];
      const currentSelected: string[] = Array.isArray(response) ? response : [];

      const toggleOption = (id: string) => {
        if (disabled) return;
        if (currentSelected.includes(id)) {
          onChange(currentSelected.filter((item) => item !== id));
        } else {
          onChange([...currentSelected, id]);
        }
      };

      return (
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs font-medium">
            Select all correct options:
          </div>
          {options.map((opt, idx) => {
            const isSelected = currentSelected.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors active:scale-[0.995] ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-primary/40 text-foreground ring-1'
                    : 'border-border/70 bg-card hover:bg-muted/30 hover:border-border text-foreground'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOption(opt.id)}
                  disabled={disabled}
                  className="checkbox checkbox-primary checkbox-xs mt-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="border-border/60 bg-muted/40 text-muted-foreground mt-0.5 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium">
                      {getLetter(idx)}
                    </span>
                    <div className="selectable-content flex-1 text-xs leading-relaxed sm:text-sm">
                      <MathRenderer content={opt.text} />
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      );
    }

    case 'true_false': {
      const options: QuestionOption[] = question.options || [
        { id: 'opt_0', text: 'True', isCorrect: false },
        { id: 'opt_1', text: 'False', isCorrect: false },
      ];

      return (
        <div className="grid max-w-sm grid-cols-2 gap-3">
          {options.map((opt) => {
            const isSelected = response === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                disabled={disabled}
                className={`btn btn-sm h-9 rounded-md text-xs font-medium transition-colors active:scale-95 ${
                  isSelected
                    ? 'btn-primary shadow-xs'
                    : 'btn-outline border-border/70 hover:bg-muted text-foreground'
                }`}
              >
                {opt.text}
              </button>
            );
          })}
        </div>
      );
    }

    case 'numerical': {
      return (
        <div className="max-w-xs space-y-2">
          <label className="text-muted-foreground text-xs font-medium">Numerical Answer:</label>
          <div className="join w-full">
            <input
              type="number"
              step="any"
              placeholder="e.g. 15.25"
              value={response ?? ''}
              onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
              disabled={disabled}
              className="input input-bordered input-sm join-item border-border/70 bg-background w-full rounded-l-md font-mono text-xs"
            />
            {question.unit && (
              <span className="bg-muted/40 border-border/70 text-muted-foreground join-item flex items-center border px-3 font-mono text-xs">
                {question.unit}
              </span>
            )}
          </div>
          {question.toleranceAbsolute ? (
            <p className="text-muted-foreground font-mono text-[11px]">
              Tolerance accepted: ±{question.toleranceAbsolute} {question.unit || ''}
            </p>
          ) : null}
        </div>
      );
    }

    case 'integer': {
      return (
        <div className="max-w-xs space-y-2">
          <label className="text-muted-foreground text-xs font-medium">Integer Answer:</label>
          <input
            type="number"
            step="1"
            placeholder="e.g. 42"
            value={response ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val === '' ? undefined : parseInt(val, 10));
            }}
            disabled={disabled}
            className="input input-bordered input-sm border-border/70 bg-background w-full rounded-md font-mono text-xs"
          />
          <p className="text-muted-foreground text-[11px]">Only integer answers are accepted.</p>
        </div>
      );
    }

    case 'fill_blank': {
      return (
        <div className="max-w-md space-y-2">
          <label className="text-muted-foreground text-xs font-medium">Your Answer:</label>
          <input
            type="text"
            placeholder="Type answer here..."
            value={response ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="input input-bordered input-sm border-border/70 bg-background w-full rounded-md text-xs"
          />
        </div>
      );
    }

    case 'match': {
      const matches = question.matches || [];
      const currentMap: Record<string, string> =
        typeof response === 'object' && response !== null ? response : {};
      const rightOptions = Array.from(new Set(matches.map((m) => m.right)));

      const handleSelect = (left: string, right: string) => {
        if (disabled) return;
        onChange({ ...currentMap, [left]: right });
      };

      return (
        <div className="space-y-3">
          <div className="text-muted-foreground text-xs font-medium">Match each item:</div>
          <div className="space-y-2">
            {matches.map((m, idx) => (
              <div
                key={idx}
                className="bg-card border-border/70 flex flex-col justify-between gap-2.5 rounded-lg border p-3 sm:flex-row sm:items-center"
              >
                <div className="text-foreground text-xs sm:w-1/2 sm:text-sm">
                  <MathRenderer content={m.left} />
                </div>
                <div className="sm:w-1/2">
                  <select
                    className="select select-bordered select-xs border-border/70 bg-background w-full rounded"
                    value={currentMap[m.left] || ''}
                    onChange={(e) => handleSelect(m.left, e.target.value)}
                    disabled={disabled}
                  >
                    <option value="">Choose match...</option>
                    {rightOptions.map((opt, rIdx) => (
                      <option key={rIdx} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'assertion_reason': {
      const options: QuestionOption[] = question.options || [
        {
          id: 'A',
          text: 'Both (A) and (R) are true and (R) is the correct explanation of (A)',
          isCorrect: false,
        },
        {
          id: 'B',
          text: 'Both (A) and (R) are true but (R) is not the correct explanation of (A)',
          isCorrect: false,
        },
        { id: 'C', text: '(A) is true but (R) is false', isCorrect: false },
        { id: 'D', text: '(A) is false but (R) is true', isCorrect: false },
        { id: 'E', text: 'Both (A) and (R) are false', isCorrect: false },
      ];

      return (
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs font-medium">Select option:</div>
          {options.map((opt) => {
            const isSelected = response === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors active:scale-[0.995] ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-primary/40 text-foreground ring-1'
                    : 'border-border/70 bg-card hover:bg-muted/30 hover:border-border text-foreground'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name={`ar_${question.id}`}
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => onChange(opt.id)}
                  disabled={disabled}
                  className="radio radio-primary radio-xs mt-1 shrink-0"
                />
                <div className="selectable-content flex-1">
                  <span className="border-primary/20 bg-primary/10 text-primary mr-2 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium">
                    {opt.id}
                  </span>
                  <span className="text-xs leading-relaxed font-medium sm:text-sm">{opt.text}</span>
                </div>
              </label>
            );
          })}
        </div>
      );
    }

    default:
      return <div>Unsupported question type</div>;
  }
};
