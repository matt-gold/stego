import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { buildIndexFromHeadingScan } from '../../features/indexing/leafIndexService';
import { buildProjectScanPlan } from '../../features/project/fileScan';

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stego-extension-content-index-'));
}

test('buildProjectScanPlan includes content leaf files recursively', async () => {
  const projectDir = createTempProject();
  try {
    writeFile(path.join(projectDir, 'content', 'chapters', '100-opening.md'), '# Opening\n');
    writeFile(path.join(projectDir, 'content', 'reference', 'characters', 'ABI-ONE.md'), '---\nid: ABI-ONE\n---\n# Abigail\n');
    writeFile(path.join(projectDir, 'content', 'reference', 'characters', 'supporting', 'notes.txt'), 'plain text note\n');

    const scanPlan = await buildProjectScanPlan(projectDir);

    assert.ok(scanPlan.files.includes(path.join(projectDir, 'content', 'chapters', '100-opening.md')));
    assert.ok(scanPlan.files.includes(path.join(projectDir, 'content', 'reference', 'characters', 'ABI-ONE.md')));
    assert.ok(scanPlan.files.includes(path.join(projectDir, 'content', 'reference', 'characters', 'supporting', 'notes.txt')));
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('buildIndexFromHeadingScan applies branch leafPolicy defaults before deriving labels', async () => {
  const projectDir = createTempProject();
  try {
    const leafPath = path.join(projectDir, 'content', 'reference', 'characters', 'ABI-ONE.md');
    writeFile(leafPath, '---\nid: ABI-ONE\n---\n# Abigail\n');

    const index = await buildIndexFromHeadingScan(
      [leafPath],
      projectDir,
      {
        projectDir,
        branches: [
          {
            id: 'reference/characters',
            name: 'characters',
            label: 'Characters',
            parentId: 'reference',
            relativeDir: 'content/reference/characters',
            notesFile: 'content/reference/characters/_branch.md',
            leafPolicy: {
              defaults: {
                label: 'Character Profile'
              }
            },
            effectiveLeafPolicy: {
              requiredMetadata: [],
              defaults: {
                label: 'Character Profile'
              }
            },
            body: ''
          }
        ]
      }
    );

    const record = index.get('ABI-ONE');
    assert.equal(record?.label, 'Character Profile');
    assert.equal(record?.title, 'Character Profile');
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
