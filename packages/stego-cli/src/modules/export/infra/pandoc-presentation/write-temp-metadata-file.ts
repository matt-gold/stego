import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";

export function writeTempMetadataFile(metadata: Record<string, unknown>): {
  path: string;
  cleanup: () => void;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-template-export-"));
  const metadataFilePath = path.join(tempDir, "metadata.yaml");
  fs.writeFileSync(metadataFilePath, yaml.dump(metadata), "utf8");
  return {
    path: metadataFilePath,
    cleanup: () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
