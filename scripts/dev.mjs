// `npm start`: starts the server (port 3000) and the frontend (http://localhost:5173) together.
// Ctrl+C stops both; if either one exits, the other is stopped too.
import { spawn } from 'node:child_process';

const windows = process.platform === 'win32';
const children = ['server', 'frontend'].map((workspace) =>
  spawn(windows ? 'npm.cmd' : 'npm', ['run', 'dev', '-w', workspace], { stdio: 'inherit', shell: windows }),
);

function stopAll() {
  for (const child of children) if (child.exitCode === null) child.kill();
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
for (const child of children) {
  child.on('exit', (code) => {
    process.exitCode ||= code ?? 0;
    stopAll();
  });
}
