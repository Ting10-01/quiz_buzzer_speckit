// What a blank cell gets: the sub-question marker 003 found in it ("（1）"), then the answer.
// The caller passes "" when the marker is in another cell (REQ-RES-08).
export function composeCellText(marker: string, answer: string): string {
  return marker + answer;
}

const pad = (n: number) => String(n).padStart(2, '0');

// `<worksheet>-備份-YYYYMMDD-HHmm` in the server's local time; -2, -3, ... when taken (research RD-05).
export function backupName(worksheet: string, now: Date, existing: string[]): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const base = `${worksheet}-備份-${stamp}`;
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
