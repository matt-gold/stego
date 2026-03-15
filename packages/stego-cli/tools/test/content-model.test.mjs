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
  fs.mkdirSync(path.join(projectRoot, 'content'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true });
  writeFile(path.join(projectRoot, 'stego-project.json'), `${JSON.stringify(projectJson, null, 2)}\n`);
  return projectRoot;
}

test('content read lists leaves with ids and headings', () => {
  const projectId = `content-read-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Content Read Test',
    requiredMetadata: ['status']
  });

  try {
    writeFile(
      path.join(projectRoot, 'content', '100-scene.md'),
      `---\nid: CH-ONE\nstatus: draft\nchapter: 1\n---\n\n# Opening\n\nBody.\n`
    );
    writeFile(
      path.join(projectRoot, 'content', 'reference', 'SRC-ONE.md'),
      `---\nid: SRC-ONE\nkind: reference\nlabel: Source One\n---\n\n# Source One\n\nFact.\n`
    );
    writeFile(
      path.join(projectRoot, 'content', 'reference', '_branch.md'),
      `---\nlabel: Reference\n---\n\nReference notes.\n`
    );

    const read = runCli(['content', 'read', '--project', projectId, '--format', 'json']);
    assert.equal(read.status, 0, `${read.stdout}\n${read.stderr}`);

    const payload = JSON.parse(read.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.operation, 'content.read');
    assert.equal(Array.isArray(payload.result.content), true);
    assert.equal(payload.result.content.length, 2);
    assert.equal(payload.result.content.some((entry) => entry.relativePath.endsWith('_branch.md')), false);
    const chapterLeaf = payload.result.content.find((entry) => entry.id === 'CH-ONE');
    assert.ok(chapterLeaf);
    assert.equal(chapterLeaf.format, 'markdown');
    assert.equal(chapterLeaf.headings[0].anchor, 'CH-ONE--opening');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate treats _branch.md as branch metadata, not a leaf', () => {
  const projectId = `branch-validate-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Branch Validate Test',
    requiredMetadata: ['status']
  });

  try {
    writeFile(path.join(projectRoot, 'content', '_branch.md'), '---\nlabel: Root Notes\n---\n\nRoot notes.\n');
    writeFile(path.join(projectRoot, 'content', '100-one.md'), '---\nid: CH-ONE\nstatus: draft\n---\n\nOne.\n');

    const validate = runCli(['validate', '--project', projectId]);
    assert.equal(validate.status, 0, `${validate.stdout}\n${validate.stderr}`);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate rejects invalid _branch.md metadata', () => {
  const projectId = `branch-invalid-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Invalid Branch Test',
    requiredMetadata: ['status']
  });

  try {
    writeFile(path.join(projectRoot, 'content', '_branch.md'), '---\nkind: reference\n---\n\nInvalid.\n');
    writeFile(path.join(projectRoot, 'content', '100-one.md'), '---\nid: CH-ONE\nstatus: draft\n---\n\nOne.\n');

    const validate = runCli(['validate', '--project', projectId]);
    assert.equal(validate.status, 1, `${validate.stdout}\n${validate.stderr}`);
    assert.match(`${validate.stdout}\n${validate.stderr}`, /unsupported frontmatter key 'kind'/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate rejects missing and duplicate leaf ids', () => {
  const projectId = `leaf-validate-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId, {
    id: projectId,
    title: 'Leaf Validate Test',
    requiredMetadata: ['status']
  });

  try {
    writeFile(path.join(projectRoot, 'templates', 'book.template.tsx'), `import { defineTemplate, Stego } from "@stego-labs/engine";
export default defineTemplate((ctx) => (
  <Stego.Document>
    {ctx.content.map((leaf) => <Stego.Markdown leaf={leaf} />)}
  </Stego.Document>
));
`);
    writeFile(path.join(projectRoot, 'content', '100-one.md'), '---\nstatus: draft\n---\n\nOne.\n');
    writeFile(path.join(projectRoot, 'content', '200-two.md'), '---\nid: DUPLICATE\nstatus: draft\n---\n\nTwo.\n');
    writeFile(path.join(projectRoot, 'content', '300-three.md'), '---\nid: DUPLICATE\nstatus: draft\n---\n\nThree.\n');

    const validate = runCli(['validate', '--project', projectId]);
    assert.equal(validate.status, 1, `${validate.stdout}\n${validate.stderr}`);
    const output = `${validate.stdout}\n${validate.stderr}`;
    assert.match(output, /Missing required leaf id/);
    assert.match(output, /Duplicate leaf id 'DUPLICATE'/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
