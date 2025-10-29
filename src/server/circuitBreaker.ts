// src/server/circuitBreaker.ts
type State = 'closed' | 'open' | 'half';

export class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private nextTryAt = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 10_000
  ) {}

  canPass(): boolean {
    const now = Date.now();
    if (this.state === 'open' && now >= this.nextTryAt) {
      this.state = 'half';
      return true;
    }
    return this.state !== 'open';
  }

  onSuccess() {
    this.state = 'closed';
    this.failures = 0;
  }

  onFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.nextTryAt = Date.now() + this.cooldownMs;
    }
  }
}

