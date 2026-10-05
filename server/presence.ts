export class Presence {
  private timers = new Map<number, NodeJS.Timeout>();

  constructor(
    private graceMs: number,
    private onExpire: (sessionId: number) => void,
  ) {}

  opened(sessionId: number) {
    this.cancel(sessionId);
  }

  closed(sessionId: number, remaining: number) {
    if (remaining > 0) return;
    this.cancel(sessionId);
    this.timers.set(
      sessionId,
      setTimeout(() => {
        this.timers.delete(sessionId);
        this.onExpire(sessionId);
      }, this.graceMs),
    );
  }

  cancel(sessionId: number) {
    const timer = this.timers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(sessionId);
  }

  stop() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }
}
