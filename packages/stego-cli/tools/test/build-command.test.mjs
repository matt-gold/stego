import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const projectsDir = path.join(repoRoot, 'projects');
const cliPath = path.join(repoRoot, 'tools', 'stego-cli.ts');

function runCli(args) {
  return spawnSync('node', ['--experimental-strip-types', cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createTempProject(projectId, projectJson, manuscriptFiles, templateContent) {
  const projectRoot = path.join(projectsDir, projectId);
  fs.mkdirSync(path.join(projectRoot, 'manuscript'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'spine'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'templates'), { recursive: true });

  writeFile(path.join(projectRoot, 'stego-project.json'), `${JSON.stringify(projectJson, null, 2)}\n`);
  writeFile(path.join(projectRoot, 'spine', 'characters.md'), '# Characters\n');
  writeFile(
    path.join(projectRoot, 'templates', 'book.template.tsx'),
    templateContent || `import { defineTemplate, Stego } from "@stego/engine";
export default defineTemplate((ctx) => (
  <Stego.Document>
    {ctx.collections.manuscripts.splitBy("chapter").map((group) => (
      <Stego.Section role="chapter">
        <Stego.Heading level={2}>
          Chapter {group.value}
          {group.first.metadata.chapter_title ? \`: \${String(group.first.metadata.chapter_title)}\` : ""}
        </Stego.Heading>
        {group.items.map((doc) => <Stego.Markdown source={doc.body} />)}
      </Stego.Section>
    ))}
  </Stego.Document>
));
`
  );

  for (const [name, content] of manuscriptFiles) {
    writeFile(path.join(projectRoot, 'manuscript', name), content);
  }

  return projectRoot;
}

test('validate rejects legacy compileStructure configuration', () => {
  const projectId = `compile-structure-invalid-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'Invalid Compile Structure Test',
      requiredMetadata: ['status'],
      compileStructure: {
        levels: [
          {
            key: 'chapter',
            label: 'Chapter',
            pageBreak: 'before-group'
          }
        ]
      }
    },
    [
      ['100-first.md', '---\nstatus: draft\n---\n\nHello world.\n']
    ]
  );

  try {
    const result = runCli(['validate', '--project', projectId]);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 1, output);
    assert.match(output, /Legacy 'compileStructure'/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('build uses the project template and splitBy inherits missing chapter metadata', () => {
  const projectId = `template-build-split-by-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'Template Build Test',
      requiredMetadata: ['status']
    },
    [
      ['100-scene-a.md', '---\nstatus: draft\ntitle: Scene A\nchapter: 1\nchapter_title: Arrival\n---\n\nA\n'],
      ['200-scene-b.md', '---\nstatus: draft\ntitle: Scene B\n---\n\nB\n'],
      ['300-scene-c.md', '---\nstatus: draft\ntitle: Scene C\nchapter: 2\nchapter_title: Fork\n---\n\nC\n'],
      ['400-scene-d.md', '---\nstatus: draft\ntitle: Scene D\n---\n\nD\n']
    ]
  );

  try {
    const buildResult = runCli(['build', '--project', projectId]);
    assert.equal(buildResult.status, 0, `${buildResult.stdout}\n${buildResult.stderr}`);

    const outputPath = path.join(projectRoot, 'dist', `${projectId}.md`);
    const renderPlanPath = path.join(projectRoot, 'dist', `${projectId}.render-plan.json`);
    const built = fs.readFileSync(outputPath, 'utf8');

    assert.equal(fs.existsSync(outputPath), true);
    assert.equal(fs.existsSync(renderPlanPath), true);
    assert.match(built, /^## Chapter 1: Arrival$/m);
    assert.match(built, /^## Chapter 2: Fork$/m);
    const chapterOneHeadingCount = (built.match(/^## Chapter 1: Arrival$/gm) || []).length;
    assert.equal(chapterOneHeadingCount, 1);
    assert.match(built, /\nA\n/);
    assert.match(built, /\nB\n/);
    assert.match(built, /\nC\n/);
    assert.match(built, /\nD\n/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate does not warn for four-digit manuscript prefixes', () => {
  const projectId = `validate-four-digit-prefix-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'Four Digit Prefix Test',
      requiredMetadata: ['status']
    },
    [
      ['1200-scene.md', '---\nstatus: draft\n---\n\nHello.\n']
    ]
  );

  try {
    const result = runCli(['validate', '--project', projectId]);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /non-standard/i);
    assert.doesNotMatch(output, /three digits/i);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new infers next manuscript prefix from the last two manuscripts', () => {
  const projectId = `new-manuscript-infer-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Manuscript Inference Test',
      requiredMetadata: ['status', 'chapter', 'chapter_title']
    },
    [
      ['101-first.md', '---\nstatus: draft\nchapter: 1\nchapter_title: One\n---\n\nA\n'],
      ['103-second.md', '---\nstatus: draft\nchapter: 1\nchapter_title: Two\n---\n\nB\n']
    ]
  );

  try {
    const result = runCli(['new', '--project', projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const nextPath = path.join(projectRoot, 'manuscript', '105-new-document.md');
    assert.equal(fs.existsSync(nextPath), true, `Expected manuscript file at ${nextPath}`);

    const created = fs.readFileSync(nextPath, 'utf8');
    assert.match(created, /^---\nstatus: draft\nchapter:\nchapter_title:\n---\n\n$/m);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new supports explicit prefix via -i and --i', () => {
  const projectId = `new-manuscript-explicit-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Manuscript Explicit Prefix Test',
      requiredMetadata: ['status']
    },
    [
      ['100-first.md', '---\nstatus: draft\n---\n\nA\n'],
      ['200-second.md', '---\nstatus: draft\n---\n\nB\n']
    ]
  );

  try {
    const shortFlag = runCli(['new', '--project', projectId, '-i', '350']);
    assert.equal(shortFlag.status, 0, `${shortFlag.stdout}\n${shortFlag.stderr}`);
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'manuscript', '350-new-document.md')),
      true,
      'Expected manuscript created with -i'
    );

    const longFlag = runCli(['new', '--project', projectId, '--i', '500']);
    assert.equal(longFlag.status, 0, `${longFlag.stdout}\n${longFlag.stderr}`);
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'manuscript', '500-new-document.md')),
      true,
      'Expected manuscript created with --i'
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new supports explicit filename via --filename', () => {
  const projectId = `new-manuscript-filename-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Manuscript Filename Test',
      requiredMetadata: ['status']
    },
    [
      ['100-first.md', '---\nstatus: draft\n---\n\nA\n']
    ]
  );

  try {
    const result = runCli(['new', '--project', projectId, '--filename', '250-custom-scene.md']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const createdPath = path.join(projectRoot, 'manuscript', '250-custom-scene.md');
    assert.equal(fs.existsSync(createdPath), true, `Expected manuscript file at ${createdPath}`);

    const created = fs.readFileSync(createdPath, 'utf8');
    assert.match(created, /^---\nstatus: draft\n---\n\n$/m);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new rejects using --filename with --i', () => {
  const projectId = `new-manuscript-filename-conflict-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Manuscript Filename Conflict Test',
      requiredMetadata: ['status']
    },
    []
  );

  try {
    const result = runCli(['new', '--project', projectId, '--i', '300', '--filename', '400-custom-scene.md']);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /--filename and --i\/-i cannot be used together/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
