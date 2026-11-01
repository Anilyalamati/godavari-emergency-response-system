import type { StaffApiService } from '../services/staff-service.js';

export interface EscalationWorkerOptions {
  intervalMs?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export class EscalationWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly intervalMs: number;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(
    private readonly service: StaffApiService,
    options: EscalationWorkerOptions = {},
  ) {
    this.intervalMs = Math.max(options.intervalMs ?? 10_000, 1000);
    this.logger = options.logger ?? console;
  }

  async runOnce(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }
    this.isProcessing = true;
    try {
      const result = await this.service.scanEscalations();
      if (result.escalatedCount > 0) {
        this.logger.info(
          `[EscalationWorker] Escalated ${result.escalatedCount} overdue active assignment(s).`,
        );
      }
      return result.escalatedCount;
    } catch (error) {
      this.logger.warn(
        `[EscalationWorker] Escalation check encountered error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    // Unref timer so node process can shut down gracefully if needed
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }
}
