import type { Server, Socket } from 'socket.io';
import { STUDENTS_ROOM } from './ActivityBroadcaster.js';
import type { ActivityManager } from './ActivityManager.js';
import { Audience } from './ActivityView.js';
import type { GroupMembership } from './GroupMembership.js';

// 004's part of every Socket.IO connection (contracts/socket-events.md). 002's handshake has already
// set socket.data.isTeacher and put teacher connections in TEACHER_ROOM.
export class ActivityGateway {
  constructor(
    private readonly manager: ActivityManager,
    private readonly membership: GroupMembership,
  ) {}

  attach(io: Server): void {
    io.on('connection', (socket) => this.onConnection(socket));
  }

  private onConnection(socket: Socket): void {
    const isTeacher = socket.data.isTeacher === true;
    if (!isTeacher) void socket.join(STUDENTS_ROOM);

    const studentToken: unknown = socket.handshake.auth.studentToken;
    this.membership.attach(socket, typeof studentToken === 'string' ? studentToken : undefined);
    socket.on('disconnect', () => this.membership.detach(socket));

    // The current state right away, so a new or reconnected tab never waits for a change (REQ-ACT-15).
    socket.emit('activity:snapshot', this.manager.snapshot(isTeacher ? Audience.TEACHER : Audience.PUBLIC));
  }
}
