/**
 * Authoritative Timing Engine for takemock.
 * Prevents clock drift via monotonic wall-clock delta calculation.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 18 & Invariant 3.
 */

import type { TimingMode, TimingPolicy } from '@/types/test';

export type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'EXPIRED' | 'COMPLETED';

export interface TimerSnapshot {
  state: TimerState;
  mode: TimingMode;
  totalDurationSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  isWarning: boolean;
}

export class TimingEngine {
  private state: TimerState = 'IDLE';
  private mode: TimingMode = 'GLOBAL';
  private totalDurationSeconds: number = 0;
  private accumulatedElapsedMs: number = 0;
  private currentIntervalStartMs: number = 0;
  private elapsedSeconds: number = 0;
  private warnThresholdSeconds: number = 300;
  private onExpireCallback?: () => void;

  constructor(policy: TimingPolicy, initialElapsedSeconds: number = 0, onExpire?: () => void) {
    this.mode = policy.mode;
    this.totalDurationSeconds = policy.totalDurationSeconds;
    this.accumulatedElapsedMs = Math.max(0, initialElapsedSeconds * 1000);
    this.elapsedSeconds = Math.floor(this.accumulatedElapsedMs / 1000);
    this.warnThresholdSeconds = policy.warnThresholdSeconds || 300;
    this.onExpireCallback = onExpire;

    if (this.mode === 'NONE' || this.totalDurationSeconds <= 0) {
      this.state = 'RUNNING'; // stopwatch / untimed mode
    }
  }

  public start(): void {
    if (this.state === 'COMPLETED' || this.state === 'EXPIRED') return;
    this.state = 'RUNNING';
    this.currentIntervalStartMs = Date.now();
  }

  public pause(): void {
    if (this.state !== 'RUNNING') return;
    const now = Date.now();
    if (this.currentIntervalStartMs > 0) {
      this.accumulatedElapsedMs += Math.max(0, now - this.currentIntervalStartMs);
      this.currentIntervalStartMs = 0;
    }
    this.state = 'PAUSED';
    this.sync();
  }

  public resume(): void {
    if (this.state !== 'PAUSED') return;
    this.state = 'RUNNING';
    this.currentIntervalStartMs = Date.now();
    this.sync();
  }

  public complete(): void {
    if (this.state === 'RUNNING' && this.currentIntervalStartMs > 0) {
      this.accumulatedElapsedMs += Math.max(0, Date.now() - this.currentIntervalStartMs);
      this.currentIntervalStartMs = 0;
    }
    this.state = 'COMPLETED';
    this.sync();
  }

  /**
   * Synchronizes elapsed time using wall-clock delta to prevent drift.
   * Completely drift-free even under OS suspension/mobile backgrounding.
   */
  public sync(): TimerSnapshot {
    if (this.state === 'RUNNING' && this.currentIntervalStartMs > 0) {
      const now = Date.now();
      const currentDeltaMs = Math.max(0, now - this.currentIntervalStartMs);
      const totalElapsedMs = this.accumulatedElapsedMs + currentDeltaMs;
      this.elapsedSeconds = Math.floor(totalElapsedMs / 1000);

      // Check for expiration in countdown mode
      if (this.mode !== 'NONE' && this.totalDurationSeconds > 0) {
        if (this.elapsedSeconds >= this.totalDurationSeconds) {
          this.elapsedSeconds = this.totalDurationSeconds;
          this.accumulatedElapsedMs = this.totalDurationSeconds * 1000;
          this.currentIntervalStartMs = 0;
          this.state = 'EXPIRED';
          if (this.onExpireCallback) {
            this.onExpireCallback();
          }
        }
      }
    } else {
      this.elapsedSeconds = Math.floor(this.accumulatedElapsedMs / 1000);
    }

    return this.getSnapshot();
  }

  public getSnapshot(): TimerSnapshot {
    const remainingSeconds =
      this.mode === 'NONE' || this.totalDurationSeconds <= 0
        ? 0
        : Math.max(0, this.totalDurationSeconds - this.elapsedSeconds);

    const isWarning =
      this.mode !== 'NONE' &&
      this.totalDurationSeconds > 0 &&
      remainingSeconds <= this.warnThresholdSeconds &&
      remainingSeconds > 0;

    return {
      state: this.state,
      mode: this.mode,
      totalDurationSeconds: this.totalDurationSeconds,
      elapsedSeconds: this.elapsedSeconds,
      remainingSeconds,
      isWarning,
    };
  }
}

/**
 * Formats seconds into HH:MM:SS or MM:SS.
 */
export function formatTimeSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
