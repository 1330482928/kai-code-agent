export interface RenderBatcherOptions<TEvent> {
  flush(events: TEvent[]): void | Promise<void>;
  windowMs?: number;
  isBoundaryEvent?: (event: TEvent) => boolean;
}

export class RenderBatcher<TEvent> {
  private readonly flush: (events: TEvent[]) => void | Promise<void>;
  private readonly isBoundaryEvent: (event: TEvent) => boolean;
  private readonly windowMs: number;
  private readonly pending: TEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: RenderBatcherOptions<TEvent>) {
    this.flush = options.flush;
    this.isBoundaryEvent = options.isBoundaryEvent ?? (() => false);
    this.windowMs = options.windowMs ?? 32;
  }

  enqueue(event: TEvent): void {
    this.pending.push(event);
    if (this.isBoundaryEvent(event)) {
      void this.flushNow();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flushNow();
      }, this.windowMs);
    }
  }

  async flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.length === 0) {
      return;
    }
    const events = this.pending.splice(0, this.pending.length);
    await this.flush(events);
  }

  async dispose(): Promise<void> {
    await this.flushNow();
  }
}
