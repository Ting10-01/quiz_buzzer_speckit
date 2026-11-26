// The single place where activity state changes (research RA-02, REQ-ACT-17). Node.js runs synchronous
// code without interruption, so running every command synchronously processes them in arrival order.
// 004's commands and 005's submissions and judgements all go through the same queue.
export class CommandQueue {
  private running = false;

  run<T>(command: () => T): T {
    if (this.running) return checked(command()); // nested: part of the outer command
    this.running = true;
    try {
      return checked(command());
    } finally {
      this.running = false;
    }
  }
}

// An awaiting command would let other commands run in the middle of it.
function checked<T>(result: T): T {
  if (result instanceof Promise) throw new Error('CommandQueue commands must be synchronous (no await)');
  return result;
}
