import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExploreFileLabel } from '../../features/sidebar/tabs/explore/exploreFileLabel';

test('buildExploreFileLabel labels source paths relative to content root', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'stego-sidebar-explorer-'));

  try {
    const projectDir = path.join(tempDir, 'project');
    const filePath = path.join(projectDir, 'content', 'reference', 'characters', 'CHAR-AGNES.md');
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, '# CHAR-AGNES Agnes the apothecary\n\nBody\n', 'utf8');

    assert.equal(buildExploreFileLabel(filePath, projectDir), 'reference/characters/CHAR-AGNES.md');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
