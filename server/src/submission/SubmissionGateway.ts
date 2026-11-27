import {
  OWN,
  SUBMIT,
  type OwnSubmissionReply,
  type SubmitReply,
  type SubmitRequest,
} from '@quiz-buzzer/shared/submissionEvents';
import type { Server, Socket } from 'socket.io';
import type { CommandQueue } from '../activity/CommandQueue.js';
import type { GroupMembership } from '../activity/GroupMembership.js';
import type { SubmissionEngine } from './SubmissionEngine.js';

// 005's student events on 002's app.io (contracts/submission-api.md section 1). The group always comes
// from the connection; any group in the payload is ignored (REQ-SUB-02, principle VI).
export class SubmissionGateway {
  constructor(
    private readonly engine: SubmissionEngine,
    private readonly membership: GroupMembership,
    private readonly queue: CommandQueue,
  ) {}

  register(io: Server): void {
    io.on('connection', (socket) => {
      socket.on(SUBMIT, (request: unknown, ack: unknown) => this.onSubmit(socket, request, ack));
      socket.on(OWN, (request: unknown, ack: unknown) => this.onOwn(socket, request, ack));
    });
  }

  private onSubmit(socket: Socket, request: unknown, ack: unknown): void {
    if (typeof ack !== 'function') return;
    const group = this.membership.groupOf(socket);
    const reply = this.queue.run(() => this.engine.submit(group, pick(request)));
    (ack as (reply: SubmitReply) => void)(reply);
  }

  /** Read only, so not through the CommandQueue. */
  private onOwn(socket: Socket, request: unknown, ack: unknown): void {
    if (typeof ack !== 'function') return;
    const questionNumber: unknown = (request as { questionNumber?: unknown } | null)?.questionNumber;
    const submission =
      typeof questionNumber === 'number' ? this.engine.ownSubmission(this.membership.groupOf(socket), questionNumber) : null;
    (ack as (reply: OwnSubmissionReply) => void)({ submission });
  }
}

/** Only questionNumber, answers and requestId are read; the engine checks their types. */
function pick(request: unknown): SubmitRequest {
  if (typeof request !== 'object' || request === null) return request as SubmitRequest;
  const { questionNumber, answers, requestId } = request as SubmitRequest;
  return { questionNumber, answers, requestId };
}
