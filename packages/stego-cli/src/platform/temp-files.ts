import os from "node:os";
import path from "node:path";
import { fileSystem } from "./fs.ts";

export function makeTempDir(prefix: string): string {
  return fileSystem.mkdtempSync(path.join(os.tmpdir(), prefix));
}
