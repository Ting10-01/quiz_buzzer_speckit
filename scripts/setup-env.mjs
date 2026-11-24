// `npm run setup`: asks for the Google values and writes server/.env (README "Google 登入設定").
// Press Enter to keep a value already in server/.env. Secrets are not echoed to the screen.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const ENV_FILE = new URL('../server/.env', import.meta.url);

const FIELDS = [
  { name: 'GOOGLE_CLIENT_ID', label: 'OAuth 用戶端 ID' },
  { name: 'GOOGLE_CLIENT_SECRET', label: 'OAuth 用戶端密鑰', secret: true },
  { name: 'GOOGLE_API_KEY', label: 'Picker 用的 API 金鑰', secret: true },
  { name: 'GOOGLE_APP_ID', label: '專案編號（數字）' },
];

const current = {};
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) current[match[1]] = match[2];
  }
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();
let muted = false;
// Hide what is typed for secret answers; line breaks still go through.
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (text) => {
  if (!muted || text.includes('\n')) write(text);
};

async function ask(question, secret) {
  process.stdout.write(question);
  muted = secret;
  const { value = '' } = await lines.next();
  muted = false;
  if (!process.stdin.isTTY) process.stdout.write('\n');
  return value;
}

console.log('設定 server/.env。直接按 Enter 會保留原本的值。\n');
for (const field of FIELDS) {
  const hint = current[field.name] ? '（已設定，Enter 保留）' : '';
  const answer = (await ask(`${field.label}${hint}${field.secret ? '（輸入時不會顯示）' : ''}：`, field.secret))
    .trim()
    .replace(/^["']|["']$/g, '');
  if (answer) current[field.name] = answer;
}
rl.close();

current.PORT ||= '3000';
const names = [...FIELDS.map((field) => field.name), 'PORT'];
writeFileSync(ENV_FILE, names.map((name) => `${name}=${current[name] ?? ''}`).join('\n') + '\n', { mode: 0o600 });

const missing = FIELDS.filter((field) => !current[field.name]).map((field) => field.name);
console.log(
  missing.length
    ? `\n已寫入 server/.env，還缺：${missing.join('、')}。之後再執行 npm run setup 補上。`
    : '\n已寫入 server/.env。執行 npm run dev 啟動系統。',
);
