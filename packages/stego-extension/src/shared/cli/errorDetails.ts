import { extractCliErrorMessage } from './json';

export function pickCliFailureDetails(stdout: string, stderr: string): string {
  const structured = extractCliErrorMessage(stdout, stderr);
  if (structured) {
    return structured;
  }

  const lines = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return '';
  }

  for (const line of lines) {
    const match = line.match(/^ERROR:\s*(.+)$/i);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }

  for (const line of lines) {
    if (/^npm error /i.test(line) || /^npm ERR!/i.test(line)) {
      continue;
    }
    if (/^node:/i.test(line)) {
      continue;
    }
    if (/^at\s+/.test(line)) {
      continue;
    }
    if (/^>\s/.test(line)) {
      continue;
    }
    if (/^\^$/.test(line)) {
      continue;
    }
    if (/^code:/i.test(line) || /^url:/i.test(line)) {
      continue;
    }
    if (/^lifecycle script/i.test(line)) {
      continue;
    }
    return line;
  }

  return lines[lines.length - 1] ?? '';
}
