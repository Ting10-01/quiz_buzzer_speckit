import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.env);
const app = buildApp(config);

if (config.missingGoogleVars.length > 0) {
  // Names only, never values (REQ-AUTH-13).
  app.log.warn({ missingGoogleVars: config.missingGoogleVars }, 'Google sign-in is not configured');
}

await app.listen({ host: '127.0.0.1', port: config.port });
