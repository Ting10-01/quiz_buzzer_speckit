import type { FastifyInstance } from 'fastify';
import type { ImportStore } from '../guided-notes/ImportStore.js';
import { ActivityBroadcaster } from './ActivityBroadcaster.js';
import { ActivityGateway } from './ActivityGateway.js';
import { ActivityManager } from './ActivityManager.js';
import { activityRoutes } from './activityRoutes.js';
import { ActivityStore } from './ActivityStore.js';
import { CommandQueue } from './CommandQueue.js';
import { GroupMembership } from './GroupMembership.js';
import { SequenceClock } from './SequenceClock.js';

export { ActivityManager, ActivityRuleError } from './ActivityManager.js';
export { ActivityStore, type ActivityState } from './ActivityStore.js';
export { CommandQueue } from './CommandQueue.js';
export { GroupMembership, type SocketRef } from './GroupMembership.js';
export { SequenceClock } from './SequenceClock.js';

/** One of each per server; 005 and 006 use them through `app.activity` (contracts/server-modules.md). */
export interface ActivityModule {
  store: ActivityStore;
  membership: GroupMembership;
  manager: ActivityManager;
  queue: CommandQueue;
  clock: SequenceClock;
}

export interface ActivityModuleDeps {
  importStore: ImportStore;
}

declare module 'fastify' {
  interface FastifyInstance {
    activity: ActivityModule;
  }
}

// Registered in 002's buildApp with app.register(createActivityModule, deps). Uses 002's app.io
// (WebSocket only) instead of creating another Socket.IO server (research RA-11, RA-13).
export async function createActivityModule(app: FastifyInstance, deps: ActivityModuleDeps): Promise<void> {
  const queue = new CommandQueue();
  const store = new ActivityStore();
  const membership = new GroupMembership();
  const clock = new SequenceClock();
  const manager = new ActivityManager(queue, store, membership, clock, deps.importStore);

  new ActivityBroadcaster(app.io, store, membership).start();
  new ActivityGateway(manager, membership).attach(app.io);

  await app.register(activityRoutes, { manager });

  app.decorate('activity', { store, membership, manager, queue, clock });
}

// Like fastify-plugin: `app.activity` is decorated on the root instance, not only inside this plugin.
Object.assign(createActivityModule, { [Symbol.for('skip-override')]: true });
