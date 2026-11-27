// Stands in for RealtimeClient in HttpActivityService unit tests: tests decide when the connection
// succeeds (connected()) and what the server pushes (push()).
import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import { vi } from 'vitest';
import type { Unsubscribe } from '../../src/services/interfaces';

type Listener = (payload: unknown) => void;

export class FakeRealtimeClient {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly connectListeners = new Set<() => void>();
  private token: string | null = null;

  readonly connect = vi.fn();
  readonly reconnect = vi.fn();
  /** RealtimeClient.followTeacherCredential: true when it reconnected; tests that need it set the result. */
  readonly followTeacherCredential = vi.fn((): boolean => false);
  readonly emitWithAck = vi.fn<(event: string, payload: object) => Promise<unknown>>();

  on<T>(event: string, listener: (payload: T) => void): Unsubscribe {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    this.listeners.set(event, set);
    set.add(listener as Listener);
    return () => set.delete(listener as Listener);
  }

  onConnect(listener: () => void): Unsubscribe {
    this.connectListeners.add(listener);
    return () => this.connectListeners.delete(listener);
  }

  studentToken(): string | null {
    return this.token;
  }

  setStudentToken(token: string): void {
    this.token = token;
  }

  /** The connection (or a reconnection) succeeded. */
  connected(): void {
    for (const listener of [...this.connectListeners]) listener();
  }

  /** The server pushes an `activity:snapshot`. */
  push(snapshot: ActivitySnapshot): void {
    this.emit('activity:snapshot', snapshot);
  }

  emit(event: string, payload: unknown): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(payload);
  }
}
