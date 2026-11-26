// The tab's single Socket.IO connection (data-model §3); 004's HttpActivityService and 005/006's
// services share it. WebSocket only (REQ-ACT-20). See research RA-07 for the teacher credential rules.
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import type { TeacherCredentialStore } from './http/TeacherCredentialStore';
import type { Unsubscribe } from './interfaces';

const STUDENT_TOKEN_KEY = 'quizBuzzer.studentToken';
const ACK_TIMEOUT_MS = 5000;
const SERVER_UNREACHABLE = '連不上伺服器，請確認伺服器已啟動';

type SocketFactory = (options: Partial<ManagerOptions & SocketOptions>) => Socket;
type Listener = (payload: unknown) => void;

export class RealtimeClient {
  private socket: Socket | null = null;
  /** The teacher credential used by the current connection's handshake. */
  private connectedTeacherToken: string | null = null;
  /** A credential 002 refused (UNAUTHORIZED); never sent again (002 #18 keeps it in the tab). */
  private rejectedTeacherToken: string | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly connectListeners = new Set<() => void>();

  constructor(
    private readonly credentials: Pick<TeacherCredentialStore, 'get'>,
    private readonly createSocket: SocketFactory = (options) => io(options),
  ) {}

  connect(): void {
    if (this.socket) return;
    const socket = this.createSocket({
      transports: ['websocket'],
      // Read again on every (re)connection, so a new sign-in or student token is always used.
      auth: (cb) => cb(this.handshakeAuth()),
    });
    socket.on('connect', () => {
      for (const listener of [...this.connectListeners]) listener();
    });
    socket.on('disconnect', (reason) => {
      // 002 drops old teacher connections when someone signs in; Socket.IO does not reconnect by itself.
      if (reason === 'io server disconnect') this.reconnect();
    });
    socket.on('connect_error', (error) => {
      if (error.message !== 'UNAUTHORIZED') return;
      // The credential was voided. Retry with a new one if the tab has it; otherwise as a student.
      if (this.credentials.get() === this.connectedTeacherToken) this.rejectedTeacherToken = this.connectedTeacherToken;
      socket.connect();
    });
    socket.onAny((event: string, payload: unknown) => {
      for (const listener of [...(this.listeners.get(event) ?? [])]) listener(payload);
    });
    this.socket = socket;
  }

  /** A new handshake with the current credentials. */
  reconnect(): void {
    if (!this.socket) return this.connect();
    this.socket.disconnect();
    this.socket.connect();
  }

  on<T>(event: string, listener: (payload: T) => void): Unsubscribe {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    this.listeners.set(event, set);
    set.add(listener as Listener);
    return () => {
      set.delete(listener as Listener);
    };
  }

  onConnect(listener: () => void): Unsubscribe {
    this.connectListeners.add(listener);
    return () => {
      this.connectListeners.delete(listener);
    };
  }

  /** Sends a student event and resolves with the server's ack; rejects with an UnexpectedError after 5 s. */
  async emitWithAck<T>(event: string, payload: object): Promise<T> {
    this.connect();
    try {
      return (await this.socket!.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as T;
    } catch {
      throw new Error(SERVER_UNREACHABLE);
    }
  }

  studentToken(): string | null {
    try {
      return sessionStorage.getItem(STUDENT_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setStudentToken(token: string): void {
    try {
      sessionStorage.setItem(STUDENT_TOKEN_KEY, token);
    } catch {
      // Storage disabled: a refreshed tab simply counts as a new student.
    }
  }

  private handshakeAuth(): { teacherToken?: string; studentToken?: string } {
    const stored = this.credentials.get();
    const teacherToken = stored && stored !== this.rejectedTeacherToken ? stored : null;
    this.connectedTeacherToken = teacherToken;
    const studentToken = this.studentToken();
    return {
      ...(teacherToken ? { teacherToken } : {}),
      ...(studentToken ? { studentToken } : {}),
    };
  }
}
