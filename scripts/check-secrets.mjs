// `npm run check:secrets` (002 T056): searches every commit in this repo for the Google values in
// server/.env and for Google token shapes. Prints only names and hit counts, never a value.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ENV_FILE = new URL('../server/.env', import.meta.url);
const NAMES = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_API_KEY', 'GOOGLE_APP_ID'];
const TOKEN_SHAPES = {
  'access token (ya29.)': 'ya29\\.[0-9A-Za-z_-]{20,}',
  'refresh token (1//)': '1//[0-9A-Za-z_-]{20,}',
  'client secret (GOCSPX-)': 'GOCSPX-[0-9A-Za-z_-]{20,}',
  'API key (AIza)': 'AIza[0-9A-Za-z_-]{35}',
};

const revisions = execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8' }).split('\n').filter(Boolean);

/** Number of matching lines across all revisions; git grep exits 1 when nothing matches. */
function hits(args) {
  try {
    const out = execFileSync('git', ['grep', '-c', ...args, ...revisions, '--', '.', ':!server/.env'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\n').filter(Boolean).reduce((sum, line) => sum + Number(line.split(':').pop()), 0);
  } catch (error) {
    if (error.status === 1) return 0;
    throw error;
  }
}

const values = {};
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].trim();
  }
}

let found = 0;
console.log(`在 ${revisions.length} 個 commit 中搜尋（不含 server/.env）：\n`);
for (const name of NAMES) {
  const value = values[name];
  if (!value) {
    console.log(`${name}：server/.env 沒有這個值，略過`);
    continue;
  }
  const count = hits(['-F', '-e', value]);
  found += count;
  console.log(`${name}：${count} 筆`);
}
for (const [label, pattern] of Object.entries(TOKEN_SHAPES)) {
  const count = hits(['-E', '-e', pattern]);
  found += count;
  console.log(`${label}：${count} 筆`);
}
console.log(found === 0 ? '\n通過：沒有找到任何機密。' : '\n有找到！請告訴 Claude 是哪一項（不要貼值）。');
process.exitCode = found === 0 ? 0 : 1;
