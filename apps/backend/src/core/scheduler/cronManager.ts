/**
 * cronManager.ts — central registry for periodic jobs.
 *
 * Phase 3 (auto-answer loop): added a per-job concurrency guard so a
 * slow tick cannot overlap the next tick. The fix mirrors the
 * atomic-write lesson from commit 60c1af0 (findOneAndUpdate over a
 * shared `running` Set) — if a job is already running, the new tick
 * is dropped with a warning instead of stacking a parallel run.
 *
 * Backwards compatible: the public API (register / startAll /
 * stopAll) is unchanged.
 */
import { logger } from '../../utils/http/logger.js';

export interface CronJob {
  name: string;
  handler: () => Promise<unknown>;
  intervalMs: number;
  runOnStartup?: boolean;
  startupDelayMs?: number;
}

export class CronManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private jobs: CronJob[] = [];
  // Per-job concurrency lock. A job name is added while its handler
  // is in-flight; the next tick checks this Set before invoking.
  private running: Set<string> = new Set();

  register(job: CronJob): void {
    this.jobs.push(job);
  }

  /**
   * Wraps a job's handler with the concurrency lock. Returns true if
   * the work ran, false if it was skipped because the job was
   * already in flight.
   */
  private async runWithLock(job: CronJob): Promise<boolean> {
    if (this.running.has(job.name)) {
      logger.warn(`[cronManager] job "${job.name}" still running, skipping tick`);
      return false;
    }
    this.running.add(job.name);
    try {
      await job.handler();
    } catch (e: any) {
      logger.error(`[cronManager] Job "${job.name}" failed: ${e.message}`);
    } finally {
      this.running.delete(job.name);
    }
    return true;
  }

  startAll(): void {
    for (const job of this.jobs) {
      // Setup the recurring interval — guarded by runWithLock so a
      // slow tick can never collide with the next one.
      const interval = setInterval(() => {
        void this.runWithLock(job);
      }, job.intervalMs);
      this.intervals.set(job.name, interval);

      // Startup execution if required — same guard applied.
      if (job.runOnStartup) {
        if (job.startupDelayMs) {
          setTimeout(() => {
            void this.runWithLock(job);
          }, job.startupDelayMs);
        } else {
          // Run immediately (asynchronously, fire-and-forget)
          void this.runWithLock(job);
        }
      }
    }
  }

  stopAll(): void {
    for (const [name, interval] of this.intervals.entries()) {
      clearInterval(interval);
    }
    this.intervals.clear();
    logger.info('[cronManager] All cron intervals cleared.');
  }
}

export const cronManager = new CronManager();
