import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { ProjectSpineCategory } from '../../shared/types';
import { buildProjectScanPlan } from '../../features/project/fileScan';

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stego-extension-spine-index-'));
}

test('buildProjectScanPlan includes spine entry files under each category', async () => {
  const projectDir = createTempProject();
  try {
    writeFile(path.join(projectDir, 'spine', 'characters', '_category.md'), '# Characters\n');
    writeFile(path.join(projectDir, 'spine', 'characters', 'example-character.md'), '# Example Character\n');
    writeFile(path.join(projectDir, 'spine', 'characters', 'supporting', 'abigail.md'), '# Abigail\n');

    const categories: ProjectSpineCategory[] = [
      { key: 'characters', prefix: 'CHARACTERS', notesFile: 'characters/_category.md' }
    ];
    const scanPlan = await buildProjectScanPlan(projectDir, categories);

    assert.ok(scanPlan.files.includes(path.join(projectDir, 'spine', 'characters', '_category.md')));
    assert.ok(scanPlan.files.includes(path.join(projectDir, 'spine', 'characters', 'example-character.md')));
    assert.ok(scanPlan.files.includes(path.join(projectDir, 'spine', 'characters', 'supporting', 'abigail.md')));
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
