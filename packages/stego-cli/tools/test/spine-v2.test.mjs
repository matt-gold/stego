import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const projectsDir = path.join(repoRoot, 'projects');
const cliPath = path.join(repoRoot, 'tools', 'stego-cli.ts');

function runCli(args, options = {}) {
  return spawnSync('node', ['--experimental-strip-types', cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options
  });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createTempProject(projectId, projectJson) {
  const projectRoot = path.join(projectsDir, projectId);
  fs.mkdirSync(path.join(projectRoot, 'manuscript'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'spine'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true });
  writeFile(path.join(projectRoot, 'stego-project.json'), `${JSON.stringify(projectJson, null, 2)}\n`);
  return projectRoot;
}

test('spine new-category and spine new --filename create Spine V2 structure', () => {
  const projectId = `spine-v2-new-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Spine V2 Test',
    requiredMetadata: ['status', 'characters']
  });

  try {
    const newCategory = runCli(['spine', 'new-category', '--project', projectId, '--key', 'characters', '--format', 'json']);
    assert.equal(newCategory.status, 0, `${newCategory.stdout}\n${newCategory.stderr}`);
    const categoryPayload = JSON.parse(newCategory.stdout);
    assert.equal(categoryPayload.ok, true);
    assert.equal(categoryPayload.operation, 'new-category');
    assert.equal(fs.existsSync(path.join(projectRoot, 'spine', 'characters', '_category.md')), true);

    const newEntry = runCli([
      'spine',
      'new',
      '--project',
      projectId,
      '--category',
      'characters',
      '--filename',
      'supporting/abigail',
      '--format',
      'json'
    ]);
    assert.equal(newEntry.status, 0, `${newEntry.stdout}\n${newEntry.stderr}`);
    const entryPayload = JSON.parse(newEntry.stdout);
    assert.equal(entryPayload.ok, true);
    assert.equal(entryPayload.operation, 'new');
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'spine', 'characters', 'supporting', 'abigail.md')),
      true
    );
    const entryContent = fs.readFileSync(
      path.join(projectRoot, 'spine', 'characters', 'supporting', 'abigail.md'),
      'utf8'
    );
    assert.equal(entryContent.includes('label:'), false);
    assert.match(entryContent, /^# Abigail/m);

    writeFile(
      path.join(projectRoot, 'manuscript', '100-scene.md'),
      `---\nstatus: draft\ncharacters:\n  - supporting/abigail\n---\n\nHello.\n`
    );
    const validate = runCli(['validate', '--project', projectId]);
    assert.equal(validate.status, 0, `${validate.stdout}\n${validate.stderr}`);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('spine read defaults entry label to top heading when frontmatter label is missing', () => {
  const projectId = `spine-v2-label-fallback-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Spine Label Fallback Test',
    requiredMetadata: ['status']
  });

  try {
    writeFile(path.join(projectRoot, 'spine', 'characters', '_category.md'), '# Characters\n');
    writeFile(
      path.join(projectRoot, 'spine', 'characters', 'matthaeus.md'),
      '# Magister Matthaeus de Rota\n\nA physician-scholar.\n'
    );

    const read = runCli(['spine', 'read', '--project', projectId, '--format', 'json']);
    assert.equal(read.status, 0, `${read.stdout}\n${read.stderr}`);
    const payload = JSON.parse(read.stdout);
    assert.equal(payload.ok, true);
    const category = payload.state.categories.find((entry) => entry.key === 'characters');
    assert.ok(category);
    const matthaeus = category.entries.find((entry) => entry.key === 'matthaeus');
    assert.ok(matthaeus);
    assert.equal(matthaeus.label, 'Magister Matthaeus de Rota');
    assert.equal(matthaeus.title, 'Magister Matthaeus de Rota');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('deprecated spine command aliases return guidance', () => {
  const projectId = `spine-v2-deprecated-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Deprecated Commands Test',
    requiredMetadata: ['status']
  });

  try {
    const addCategory = runCli(['spine', 'add-category', '--project', projectId, '--key', 'characters']);
    assert.equal(addCategory.status, 1);
    assert.match(`${addCategory.stdout}\n${addCategory.stderr}`, /new-category/);

    const newEntry = runCli(['spine', 'new-entry', '--project', projectId, '--category', 'characters']);
    assert.equal(newEntry.status, 1);
    assert.match(`${newEntry.stdout}\n${newEntry.stderr}`, /spine new/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('spine new rejects unsupported --entry option', () => {
  const projectId = `spine-v2-entry-flag-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Deprecated Entry Flag Test',
    requiredMetadata: ['status']
  });

  try {
    const category = runCli(['spine', 'new-category', '--project', projectId, '--key', 'characters']);
    assert.equal(category.status, 0, `${category.stdout}\n${category.stderr}`);

    const result = runCli([
      'spine',
      'new',
      '--project',
      projectId,
      '--category',
      'characters',
      '--entry',
      'old-style'
    ]);
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}\n${result.stderr}`, /Unknown option '--entry'/);
    assert.match(`${result.stdout}\n${result.stderr}`, /--filename/);

    const bareFlagResult = runCli([
      'spine',
      'new',
      '--project',
      projectId,
      '--category',
      'characters',
      '--entry'
    ]);
    assert.equal(bareFlagResult.status, 1);
    assert.match(`${bareFlagResult.stdout}\n${bareFlagResult.stderr}`, /Unknown option '--entry'/);
    assert.match(`${bareFlagResult.stdout}\n${bareFlagResult.stderr}`, /--filename/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('metadata apply works on spine and manuscript files', () => {
  const projectId = `spine-v2-metadata-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Metadata Apply Test',
    requiredMetadata: ['status']
  });

  try {
    writeFile(path.join(projectRoot, 'spine', 'characters', '_category.md'), '# Characters\n');
    writeFile(path.join(projectRoot, 'spine', 'characters', 'matthaeus.md'), '# Matthaeus\n');
    writeFile(path.join(projectRoot, 'manuscript', '100-scene.md'), '---\nstatus: draft\n---\n\nBody.\n');

    const spinePath = path.join(projectRoot, 'spine', 'characters', 'matthaeus.md');
    const spineApply = runCli(
      ['metadata', 'apply', spinePath, '--input', '-', '--format', 'json'],
      {
        input: `${JSON.stringify({
          frontmatter: {
            label: 'Magister Matthaeus',
            status: 'draft'
          }
        })}\n`
      }
    );
    assert.equal(spineApply.status, 0, `${spineApply.stdout}\n${spineApply.stderr}`);
    assert.match(fs.readFileSync(spinePath, 'utf8'), /label: \"?Magister Matthaeus\"?/);

    const manuscriptPath = path.join(projectRoot, 'manuscript', '100-scene.md');
    const read = runCli(['metadata', 'read', manuscriptPath, '--format', 'json']);
    assert.equal(read.status, 0, `${read.stdout}\n${read.stderr}`);
    const payload = JSON.parse(read.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.operation, 'read');
    assert.equal(payload.state.frontmatter.status, 'draft');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
