export function writeText(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
