import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedVersion: string | null = null;

export function resolveCliVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  let current = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (parsed.name === "@stego-labs/cli" && typeof parsed.version === "string") {
          cachedVersion = parsed.version;
          return cachedVersion;
        }
      } catch {
        // Continue searching upward.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  cachedVersion = "0.0.0";
  return cachedVersion;
}
