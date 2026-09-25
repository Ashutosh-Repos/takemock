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
        <div className="space-y-3">
          {options.map((opt, idx) => {
            const isSelected = response === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                    : 'border-base-300 bg-base-100 hover:border-base-content/30 hover:bg-base-200/50'
                } ${disabled ? 'cursor-not-allowed opacity-75' : ''}`}
              >
                <input
                  type="radio"
                  name={`q_${question.id}`}
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => onChange(opt.id)}
                  disabled={disabled}
                  className="radio radio-primary mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-sm font-semibold">{getLetter(idx)}</span>
                    <div className="flex-1">
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
        <div className="space-y-3">
          <div className="text-xs text-base-content/60 font-medium">Select one or more correct options:</div>
          {options.map((opt, idx) => {
            const isSelected = currentSelected.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                    : 'border-base-300 bg-base-100 hover:border-base-content/30 hover:bg-base-200/50'
                } ${disabled ? 'cursor-not-allowed opacity-75' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOption(opt.id)}
                  disabled={disabled}
                  className="checkbox checkbox-primary mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-sm font-semibold">{getLetter(idx)}</span>
                    <div className="flex-1">
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
        <div className="grid grid-cols-2 gap-4">
          {options.map((opt) => {
            const isSelected = response === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                disabled={disabled}
                className={`btn btn-lg font-bold transition-all ${
                  isSelected
                    ? 'btn-primary shadow-md'
                    : 'btn-outline border-base-300 hover:border-base-content/40'
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
        <div className="max-w-md space-y-3">
          <label className="text-sm font-semibold text-base-content/80">Enter Numerical Value:</label>
          <div className="join w-full">
            <input
              type="number"
              step="any"
              placeholder="e.g. 15.25"
              value={response ?? ''}
              onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
              disabled={disabled}
              className="input input-bordered join-item w-full font-mono text-lg"
            />
            {question.unit && (
              <span className="bg-base-200 border-base-300 join-item flex items-center px-4 font-mono text-sm border">
                {question.unit}
              </span>
            )}
          </div>
          {question.toleranceAbsolute ? (
            <p className="text-xs text-base-content/60">
              Tolerance accepted: ±{question.toleranceAbsolute} {question.unit || ''}
            </p>
          ) : null}
        </div>
      );
    }

    case 'integer': {
      return (
        <div className="max-w-md space-y-3">
          <label className="text-sm font-semibold text-base-content/80">Enter Integer Value:</label>
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
            className="input input-bordered w-full font-mono text-lg"
          />
          <p className="text-xs text-base-content/60">Only integer answers are permitted.</p>
        </div>
      );
    }

    case 'fill_blank': {
      return (
        <div className="max-w-lg space-y-3">
          <label className="text-sm font-semibold text-base-content/80">Type your answer:</label>
          <input
            type="text"
            placeholder="Type answer here..."
            value={response ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="input input-bordered w-full text-base"
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
        <div className="space-y-4">
          <div className="text-xs text-base-content/60 font-medium">Match each item from Left to Right:</div>
          <div className="space-y-3">
            {matches.map((m, idx) => (
              <div
                key={idx}
                className="bg-base-200/50 border-base-300 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
              >
                <div className="font-medium sm:w-1/2">
                  <MathRenderer content={m.left} />
                </div>
                <div className="sm:w-1/2">
                  <select
                    className="select select-bordered select-sm w-full"
                    value={currentMap[m.left] || ''}
                    onChange={(e) => handleSelect(m.left, e.target.value)}
                    disabled={disabled}
                  >
                    <option value="">-- Choose Match --</option>
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
        <div className="space-y-3">
          <div className="text-xs text-base-content/60 font-medium">Select the correct code:</div>
          {options.map((opt) => {
            const isSelected = response === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                    : 'border-base-300 bg-base-100 hover:border-base-content/30 hover:bg-base-200/50'
                } ${disabled ? 'cursor-not-allowed opacity-75' : ''}`}
              >
                <input
                  type="radio"
                  name={`ar_${question.id}`}
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => onChange(opt.id)}
                  disabled={disabled}
                  className="radio radio-primary mt-1"
                />
                <div className="flex-1">
                  <span className="badge badge-primary font-bold mr-2">{opt.id}</span>
                  <span className="text-sm font-medium">{opt.text}</span>
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
