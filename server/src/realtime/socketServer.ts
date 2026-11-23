import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { TeacherAuth } from '../auth/TeacherAuth.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

// Teacher-only pushes MUST go to `io.to(TEACHER_ROOM)` only (contracts/socket-handshake.md).
export const TEACHER_ROOM = 'teacher';

export function attachSocketServer(app: FastifyInstance, teacherAuth: TeacherAuth): Server {
  const io = new Server(app.server, { transports: ['websocket'] });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.teacherToken;
    if (token === undefined) {
      socket.data.isTeacher = false;
      return next();
    }
    if (typeof token !== 'string' || !teacherAuth.verify(token)) return next(new Error('UNAUTHORIZED'));
    socket.data.isTeacher = true;
    void socket.join(TEACHER_ROOM);
    next();
  });

  // Every socket in the room was opened with the token that was just voided.
  teacherAuth.onRotate(() => io.in(TEACHER_ROOM).disconnectSockets(true));
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
  });

  app.decorate('io', io);
  return io;
}
