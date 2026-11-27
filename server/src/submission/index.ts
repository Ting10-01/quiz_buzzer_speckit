import type { FastifyInstance } from 'fastify';
import { SubmissionEngine } from './SubmissionEngine.js';
import { SubmissionGateway } from './SubmissionGateway.js';
import { SubmissionNotifier } from './SubmissionNotifier.js';
import { submissionHttpRoutes } from './SubmissionRoutes.js';
import { SubmissionStore } from './SubmissionStore.js';
import { SubmissionVisibility } from './SubmissionVisibility.js';

export { SubmissionStore, type SubmissionRecord } from './SubmissionStore.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** The single SubmissionStore; 006 only reads list and winner (contracts/submission-store.md). */
    submissions: SubmissionStore;
  }
}

// Registered in 002's buildApp after 004's createActivityModule (plan A-1, A-2): uses 004's
// app.activity and 002's app.io instead of creating its own queue, clock or Socket.IO server.
export async function submissionRoutes(app: FastifyInstance): Promise<void> {
  const { store: activityStore, membership, manager, queue, clock } = app.activity;
  const visibility = new SubmissionVisibility();
  const submissions = new SubmissionStore();
  const notifier = new SubmissionNotifier(app.io, submissions, visibility, membership);
  const engine = new SubmissionEngine(submissions, visibility, notifier, activityStore, manager, clock, app.log);

  activityStore.subscribe((version) => engine.onActivityChange(version));
  new SubmissionGateway(engine, membership, queue).register(app.io);
  await app.register(submissionHttpRoutes, { submissions, engine, queue, activityStore });

  app.decorate('submissions', submissions);
}

// Like 004's createActivityModule: `app.submissions` is decorated on the root instance, not only inside this plugin.
Object.assign(submissionRoutes, { [Symbol.for('skip-override')]: true });
