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
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/40 text-foreground'
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground shrink-0 mt-0.5">
                      {getLetter(idx)}
                    </span>
                    <div className="flex-1 selectable-content text-xs sm:text-sm leading-relaxed">
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
          <div className="text-xs text-muted-foreground font-medium">Select all correct options:</div>
          {options.map((opt, idx) => {
            const isSelected = currentSelected.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors active:scale-[0.995] ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/40 text-foreground'
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground shrink-0 mt-0.5">
                      {getLetter(idx)}
                    </span>
                    <div className="flex-1 selectable-content text-xs sm:text-sm leading-relaxed">
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
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          {options.map((opt) => {
            const isSelected = response === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                disabled={disabled}
                className={`btn btn-sm h-9 font-medium text-xs rounded-md transition-colors active:scale-95 ${
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
          <label className="text-xs font-medium text-muted-foreground">Numerical Answer:</label>
          <div className="join w-full">
            <input
              type="number"
              step="any"
              placeholder="e.g. 15.25"
              value={response ?? ''}
              onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
              disabled={disabled}
              className="input input-bordered input-sm join-item w-full font-mono text-xs rounded-l-md border-border/70 bg-background"
            />
            {question.unit && (
              <span className="bg-muted/40 border-border/70 text-muted-foreground join-item flex items-center px-3 font-mono text-xs border">
                {question.unit}
              </span>
            )}
          </div>
          {question.toleranceAbsolute ? (
            <p className="text-[11px] text-muted-foreground font-mono">
              Tolerance accepted: ±{question.toleranceAbsolute} {question.unit || ''}
            </p>
          ) : null}
        </div>
      );
    }

    case 'integer': {
      return (
        <div className="max-w-xs space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Integer Answer:</label>
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
            className="input input-bordered input-sm w-full font-mono text-xs rounded-md border-border/70 bg-background"
          />
          <p className="text-[11px] text-muted-foreground">Only integer answers are accepted.</p>
        </div>
      );
    }

    case 'fill_blank': {
      return (
        <div className="max-w-md space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Your Answer:</label>
          <input
            type="text"
            placeholder="Type answer here..."
            value={response ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="input input-bordered input-sm w-full text-xs rounded-md border-border/70 bg-background"
          />
        </div>
      );
    }

    case 'match': {
      const matches = question.matches || [];
      const currentMap: Record<string, string> = typeof response === 'object' && response !== null ? response : {};
      const rightOptions = Array.from(new Set(matches.map((m) => m.right)));

      const handleSelect = (left: string, right: string) => {
        if (disabled) return;
        onChange({ ...currentMap, [left]: right });
      };

      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground font-medium">Match each item:</div>
          <div className="space-y-2">
            {matches.map((m, idx) => (
              <div
                key={idx}
                className="bg-card border-border/70 flex flex-col justify-between gap-2.5 rounded-lg border p-3 sm:flex-row sm:items-center"
              >
                <div className="text-xs sm:text-sm text-foreground sm:w-1/2">
                  <MathRenderer content={m.left} />
                </div>
                <div className="sm:w-1/2">
                  <select
                    className="select select-bordered select-xs w-full rounded border-border/70 bg-background"
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
        { id: 'A', text: 'Both (A) and (R) are true and (R) is the correct explanation of (A)', isCorrect: false },
        { id: 'B', text: 'Both (A) and (R) are true but (R) is not the correct explanation of (A)', isCorrect: false },
        { id: 'C', text: '(A) is true but (R) is false', isCorrect: false },
        { id: 'D', text: '(A) is false but (R) is true', isCorrect: false },
        { id: 'E', text: 'Both (A) and (R) are false', isCorrect: false },
      ];

      return (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium">Select option:</div>
          {options.map((opt) => {
            const isSelected = response === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors active:scale-[0.995] ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/40 text-foreground'
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
                <div className="flex-1 selectable-content">
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary mr-2">
                    {opt.id}
                  </span>
                  <span className="text-xs sm:text-sm font-medium leading-relaxed">{opt.text}</span>
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
