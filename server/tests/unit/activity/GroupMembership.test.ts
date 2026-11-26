import { describe, expect, it } from 'vitest';
import { GroupMembership } from '../../../src/activity/GroupMembership.js';

// data-model "GroupMembership", research RA-06; REQ-ACT-12, 13 (identity and counting), REQ-ACT-22 (reset).
const socketA = { id: 'socket-a' };
const socketB = { id: 'socket-b' };
const socketC = { id: 'socket-c' };

describe('GroupMembership', () => {
  it('creates a token on the first join and keeps it on later joins', () => {
    const groups = new GroupMembership();
    const token = groups.join(socketA, 1);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/); // 16 random bytes in base64url
    expect(groups.join(socketA, 1)).toBe(token);
    expect(groups.join(socketA, 2)).toBe(token);
  });

  it('gives different connections different tokens and counts both in the same group', () => {
    const groups = new GroupMembership();
    expect(groups.join(socketA, 3)).not.toBe(groups.join(socketB, 3));
    expect(groups.memberCounts(4)).toEqual([0, 0, 2, 0]);
  });

  it('counts the same token once when it joins the same group again after reconnecting', () => {
    const groups = new GroupMembership();
    const token = groups.join(socketA, 2);
    groups.detach(socketA);
    groups.attach(socketB, token);
    expect(groups.groupOf(socketB)).toBe(2);
    expect(groups.join(socketB, 2)).toBe(token);
    expect(groups.memberCounts(3)).toEqual([0, 1, 0]);
  });

  it('moves the member out of the old group when switching groups', () => {
    const groups = new GroupMembership();
    groups.join(socketA, 1);
    groups.join(socketB, 1);
    groups.join(socketA, 3);
    expect(groups.memberCounts(3)).toEqual([1, 0, 1]);
    expect(groups.groupOf(socketA)).toBe(3);
  });

  it('leave removes the member from its group', () => {
    const groups = new GroupMembership();
    groups.join(socketA, 2);
    groups.leave(socketA);
    expect(groups.groupOf(socketA)).toBeNull();
    expect(groups.memberCounts(2)).toEqual([0, 0]);
  });

  it('detach forgets the connection but keeps the member counted', () => {
    const groups = new GroupMembership();
    groups.join(socketA, 2);
    groups.detach(socketA);
    expect(groups.groupOf(socketA)).toBeNull();
    expect(groups.memberCounts(2)).toEqual([0, 1]);
  });

  it('ignores a token it does not know when attaching', () => {
    const groups = new GroupMembership();
    groups.attach(socketA, 'token-from-before-a-restart');
    expect(groups.groupOf(socketA)).toBeNull();
    expect(groups.memberCounts(2)).toEqual([0, 0]);
    expect(groups.join(socketA, 1)).not.toBe('token-from-before-a-restart');
  });

  it('attach without a token leaves the connection outside every group', () => {
    const groups = new GroupMembership();
    groups.attach(socketA);
    expect(groups.groupOf(socketA)).toBeNull();
  });

  it('groupOf answers per connection', () => {
    const groups = new GroupMembership();
    groups.join(socketA, 1);
    groups.join(socketB, 4);
    expect(groups.groupOf(socketA)).toBe(1);
    expect(groups.groupOf(socketB)).toBe(4);
    expect(groups.groupOf(socketC)).toBeNull();
  });

  it('memberCounts has one entry per group and highestOccupiedGroup is the largest group with members', () => {
    const groups = new GroupMembership();
    expect(groups.memberCounts(3)).toEqual([0, 0, 0]);
    expect(groups.highestOccupiedGroup()).toBe(0);
    groups.join(socketA, 2);
    groups.join(socketB, 5);
    expect(groups.memberCounts(6)).toEqual([0, 1, 0, 0, 1, 0]);
    expect(groups.highestOccupiedGroup()).toBe(5);
    groups.leave(socketB);
    expect(groups.highestOccupiedGroup()).toBe(2);
  });

  it('reset clears every group, and the same connection keeps its token when it joins again', () => {
    const groups = new GroupMembership();
    const token = groups.join(socketA, 1);
    groups.join(socketB, 2);
    groups.reset();
    expect(groups.memberCounts(2)).toEqual([0, 0]);
    expect(groups.highestOccupiedGroup()).toBe(0);
    expect(groups.groupOf(socketA)).toBeNull();
    expect(groups.groupOf(socketB)).toBeNull();
    expect(groups.join(socketA, 2)).toBe(token);
    expect(groups.memberCounts(2)).toEqual([0, 1]);
  });
});
