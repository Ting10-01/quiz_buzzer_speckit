import type { FastifyInstance } from 'fastify';
import { SubmissionEngine } from './SubmissionEngine.js';
import { SubmissionGateway } from './SubmissionGateway.js';
import { SubmissionNotifier } from './SubmissionNotifier.js';
import { submissionHttpRoutes } from './SubmissionRoutes.js';
import { SubmissionStore } from './SubmissionStore.js';
import { SubmissionVisibility } from './SubmissionVisibility.js';

export { SubmissionStore, type SubmissionRecord } from './SubmissionStore.js';

// Registered in 002's buildApp after 004's createActivityModule (plan A-1, A-2): uses 004's
// app.activity and 002's app.io instead of creating its own queue, clock or Socket.IO server.
export async function submissionRoutes(app: FastifyInstance): Promise<void> {
  const { store: activityStore, membership, manager, queue, clock } = app.activity;
  const visibility = new SubmissionVisibility();
  const submissions = new SubmissionStore();
  const notifier = new SubmissionNotifier(app.io, submissions, visibility, membership);
  const engine = new SubmissionEngine(submissions, visibility, notifier, activityStore, manager, clock);

  activityStore.subscribe((version) => engine.onActivityChange(version));
  new SubmissionGateway(engine, membership, queue).register(app.io);
  await app.register(submissionHttpRoutes, { submissions, engine, queue, activityStore });
}
