/**
 * Central Question Type Registry.
 * Allows looking up handlers dynamically and registering custom types.
 */

import type { QuestionModel, QuestionType, ValidationDiagnostic } from '@/types/question';
import * as Handlers from './handlers';
import type { QuestionTypeHandler } from './types';

class QuestionTypeRegistry {
  private handlers = new Map<QuestionType, QuestionTypeHandler>();

  constructor() {
    this.register(Handlers.SingleChoiceHandler);
    this.register(Handlers.MultipleChoiceHandler);
    this.register(Handlers.TrueFalseHandler);
    this.register(Handlers.NumericalHandler);
    this.register(Handlers.IntegerHandler);
    this.register(Handlers.FillBlankHandler);
    this.register(Handlers.MatchHandler);
    this.register(Handlers.AssertionReasonHandler);
    this.register(Handlers.PassageHandler);
    this.register(Handlers.ImageBasedHandler);
  }

  public register(handler: QuestionTypeHandler): void {
    this.handlers.set(handler.type, handler);
  }

  public get(type: QuestionType): QuestionTypeHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`Unsupported question type: "${type}". No handler registered.`);
    }
    return handler;
  }

  public has(type: QuestionType): boolean {
    return this.handlers.has(type);
  }

  public getSupportedTypes(): QuestionType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Validate any question using its registered handler.
   */
  public validate(q: QuestionModel): ValidationDiagnostic[] {
    if (!this.has(q.type)) {
      return [
        {
          level: 'ERROR',
          code: 'UNSUPPORTED_TYPE',
          message: `Unknown question type: "${q.type}". Supported types are: ${this.getSupportedTypes().join(', ')}`,
        },
      ];
    }
    return this.get(q.type).validate(q);
  }

  /**
   * Normalize any question using its registered handler.
   */
  public normalize(q: QuestionModel): QuestionModel {
    if (!this.has(q.type)) return q;
    return this.get(q.type).normalize(q);
  }
}

export const questionRegistry = new QuestionTypeRegistry();
export * from './types';
export * from './handlers';
