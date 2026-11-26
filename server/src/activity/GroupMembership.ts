import { randomBytes } from 'node:crypto';

/** What GroupMembership needs from a connection; a Socket.IO Socket fits, so no Socket.IO import here. */
export interface SocketRef {
  id: string;
}

// Which group each student belongs to, decided by the server from the connection (principle VI,
// research RA-06). Members are counted per studentToken, so a refreshed tab that joins its group
// again is not counted twice. join, leave and reset only run inside CommandQueue.run.
export class GroupMembership {
  private readonly groupByStudent = new Map<string, number>();
  private readonly studentBySocket = new Map<string, string>();

  /** On connect: maps the connection to a token the server knows; an unknown token is ignored. */
  attach(socket: SocketRef, studentToken?: string): void {
    if (studentToken !== undefined && this.groupByStudent.has(studentToken)) {
      this.studentBySocket.set(socket.id, studentToken);
    }
  }

  /** On disconnect: forgets the connection only; the member stays counted. */
  detach(socket: SocketRef): void {
    this.studentBySocket.delete(socket.id);
  }

  /** The connection's group, or null when it has not joined (005 uses this). */
  groupOf(socket: SocketRef): number | null {
    const token = this.studentBySocket.get(socket.id);
    return (token !== undefined && this.groupByStudent.get(token)) || null;
  }

  /** Puts the connection's student in the group, creating its token on the first join. */
  join(socket: SocketRef, groupNumber: number): string {
    let token = this.studentBySocket.get(socket.id);
    if (token === undefined) {
      token = randomBytes(16).toString('base64url');
      this.studentBySocket.set(socket.id, token);
    }
    this.groupByStudent.set(token, groupNumber);
    return token;
  }

  leave(socket: SocketRef): void {
    const token = this.studentBySocket.get(socket.id);
    if (token !== undefined) this.groupByStudent.delete(token);
  }

  /** Entry i is the member count of group i + 1. */
  memberCounts(groupCount: number): number[] {
    const counts = new Array<number>(groupCount).fill(0);
    for (const group of this.groupByStudent.values()) {
      if (group >= 1 && group <= groupCount) counts[group - 1]! += 1;
    }
    return counts;
  }

  /** The largest group number with members, or 0 when nobody has joined. */
  highestOccupiedGroup(): number {
    return Math.max(0, ...this.groupByStudent.values());
  }

  /**
   * The activity was cancelled (REQ-ACT-22): every group is emptied. Connections keep their tokens,
   * so a tab that joins the next activity reuses its identity but counts as a first join.
   */
  reset(): void {
    this.groupByStudent.clear();
  }
}
