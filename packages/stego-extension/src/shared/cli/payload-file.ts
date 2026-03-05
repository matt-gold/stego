import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

export async function withJsonPayloadFile<TResult>(
  prefix: string,
  payload: Record<string, unknown>,
  run: (payloadPath: string) => Promise<TResult>
): Promise<TResult> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const payloadPath = path.join(dir, 'payload.json');

  try {
    await fs.writeFile(payloadPath, `${JSON.stringify(payload)}\n`, 'utf8');
    return await run(payloadPath);
  } finally {
    try {
      await fs.unlink(payloadPath);
    } catch {
      // no-op
    }

    try {
      await fs.rmdir(dir);
    } catch {
      // no-op
    }
  }
}
