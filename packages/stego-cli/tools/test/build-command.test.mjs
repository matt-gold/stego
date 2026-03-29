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
  fs.mkdirSync(path.join(projectRoot, 'content'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'templates'), { recursive: true });

  const { requiredMetadata, ...projectMeta } = projectJson;
  writeFile(path.join(projectRoot, 'stego-project.json'), `${JSON.stringify(projectMeta, null, 2)}\n`);
  if (Array.isArray(requiredMetadata) && requiredMetadata.length > 0) {
    writeFile(
      path.join(projectRoot, 'content', '_branch.md'),
      `---\nlabel: Content\nleafPolicy:\n  requiredMetadata:\n${requiredMetadata.map((key) => `    - ${key}`).join('\n')}\n---\n`
    );
  }
  writeFile(
    path.join(projectRoot, 'templates', 'book.template.tsx'),
    templateContent || `import { defineTemplate, Stego } from "@stego-labs/engine";
export default defineTemplate((ctx) => (
  <Stego.Document>
    {Stego.splitBy(ctx.allLeaves, (leaf) => asString(leaf.metadata.chapter)).map((group) => (
      <Stego.Section role="chapter">
        <Stego.Heading level={2}>
          Chapter {group.value}
          {group.first.metadata.chapter_title ? \`: \${String(group.first.metadata.chapter_title)}\` : ""}
        </Stego.Heading>
        {group.items.map((leaf) => <Stego.Markdown leaf={leaf} />)}
      </Stego.Section>
    ))}
  </Stego.Document>
));

function asString(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}
`
  );

  for (const [name, content] of manuscriptFiles) {
    writeFile(path.join(projectRoot, 'content', name), content);
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
      ['100-first.md', '---\nid: CH-FIRST\nstatus: draft\n---\n\nHello world.\n']
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
      ['100-scene-a.md', '---\nid: CH-ARRIVAL-A\nstatus: draft\ntitle: Scene A\nchapter: 1\nchapter_title: Arrival\n---\n\nA\n'],
      ['200-scene-b.md', '---\nid: CH-ARRIVAL-B\nstatus: draft\ntitle: Scene B\n---\n\nB\n'],
      ['300-scene-c.md', '---\nid: CH-FORK-A\nstatus: draft\ntitle: Scene C\nchapter: 2\nchapter_title: Fork\n---\n\nC\n'],
      ['400-scene-d.md', '---\nid: CH-FORK-B\nstatus: draft\ntitle: Scene D\n---\n\nD\n']
    ]
  );

  try {
    const buildResult = runCli(['build', '--project', projectId]);
    assert.equal(buildResult.status, 0, `${buildResult.stdout}\n${buildResult.stderr}`);

    const outputPath = path.join(projectRoot, 'dist', `${projectId}.md`);
    const backendDocumentPath = path.join(projectRoot, 'dist', `${projectId}.backend-document.json`);
    const built = fs.readFileSync(outputPath, 'utf8');

    assert.equal(fs.existsSync(outputPath), true);
    assert.equal(fs.existsSync(backendDocumentPath), true);
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

test('validate does not warn for four-digit leaf prefixes', () => {
  const projectId = `validate-four-digit-prefix-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'Four Digit Prefix Test',
      requiredMetadata: ['status']
    },
    [
      ['1200-scene.md', '---\nid: CH-HELLO\nstatus: draft\n---\n\nHello.\n']
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

test('validate does not warn for two-digit leaf prefixes', () => {
  const projectId = `validate-two-digit-prefix-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'Two Digit Prefix Test',
      requiredMetadata: ['status']
    },
    [
      ['50-scene.md', '---\nid: CH-FIFTY\nstatus: draft\n---\n\nHello.\n']
    ]
  );

  try {
    const result = runCli(['validate', '--project', projectId]);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /non-standard/i);
    assert.doesNotMatch(output, /zero-padded prefixes/i);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new infers next leaf prefix from the last two leaves', () => {
  const projectId = `new-leaf-infer-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Manuscript Inference Test',
      requiredMetadata: ['status', 'chapter', 'chapter_title']
    },
    [
      ['101-first.md', '---\nid: CH-ONE-A\nstatus: draft\nchapter: 1\nchapter_title: One\n---\n\nA\n'],
      ['103-second.md', '---\nid: CH-ONE-B\nstatus: draft\nchapter: 1\nchapter_title: Two\n---\n\nB\n']
    ]
  );

  try {
    const result = runCli(['new', '--project', projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const nextPath = path.join(projectRoot, 'content', '105-new-leaf.md');
    assert.equal(fs.existsSync(nextPath), true, `Expected leaf file at ${nextPath}`);

    const created = fs.readFileSync(nextPath, 'utf8');
    assert.match(created, /^---\nid: NEW-LEAF\nstatus: draft\nchapter:\nchapter_title:\n---\n\n$/m);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new prefers content/manuscript as the default target when that convention exists', () => {
  const projectId = `new-leaf-manuscript-fallback-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Leaf Manuscript Fallback Test'
    },
    []
  );

  try {
    writeFile(
      path.join(projectRoot, 'content', 'manuscript', '_branch.md'),
      '---\nlabel: Manuscript\nleafPolicy:\n  requiredMetadata:\n    - status\n---\n'
    );

    const result = runCli(['new', '--project', projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const createdPath = path.join(projectRoot, 'content', 'manuscript', '100-new-leaf.md');
    assert.equal(fs.existsSync(createdPath), true, `Expected leaf file at ${createdPath}`);
    assert.equal(fs.existsSync(path.join(projectRoot, 'content', '100-new-leaf.md')), false);
    assert.match(
      fs.readFileSync(createdPath, 'utf8'),
      /^---\nid: NEW-LEAF\nstatus: draft\n---\n\n$/m
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new uses configured manuscriptSubdir as the default target', () => {
  const projectId = `new-leaf-configured-manuscript-subdir-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'Configured Manuscript Subdir Test',
      manuscriptSubdir: 'draft/chapters'
    },
    []
  );

  try {
    writeFile(
      path.join(projectRoot, 'content', 'draft', 'chapters', '_branch.md'),
      '---\nlabel: Draft Chapters\nleafPolicy:\n  requiredMetadata:\n    - status\n---\n'
    );

    const result = runCli(['new', '--project', projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const createdPath = path.join(projectRoot, 'content', 'draft', 'chapters', '100-new-leaf.md');
    assert.equal(fs.existsSync(createdPath), true, `Expected leaf file at ${createdPath}`);
    assert.equal(fs.existsSync(path.join(projectRoot, 'content', '100-new-leaf.md')), false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate warns for invalid manuscriptSubdir values', () => {
  const projectId = `validate-invalid-manuscript-subdir-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'Invalid Manuscript Subdir Test',
      manuscriptSubdir: '../outside'
    },
    [
      ['100-scene.md', '---\nid: CH-ONE\nstatus: draft\n---\n\nHello.\n']
    ]
  );

  try {
    const result = runCli(['validate', '--project', projectId]);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.match(output, /manuscriptSubdir/i);
    assert.match(output, /must stay within content/i);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new supports explicit prefix via -i and --i', () => {
  const projectId = `new-leaf-explicit-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Manuscript Explicit Prefix Test',
      requiredMetadata: ['status']
    },
    [
      ['100-first.md', '---\nid: CH-FIRST\nstatus: draft\n---\n\nA\n'],
      ['200-second.md', '---\nid: CH-SECOND\nstatus: draft\n---\n\nB\n']
    ]
  );

  try {
    const shortFlag = runCli(['new', '--project', projectId, '-i', '350']);
    assert.equal(shortFlag.status, 0, `${shortFlag.stdout}\n${shortFlag.stderr}`);
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'content', '350-new-leaf.md')),
      true,
      'Expected leaf created with -i'
    );

    const longFlag = runCli(['new', '--project', projectId, '--i', '500']);
    assert.equal(longFlag.status, 0, `${longFlag.stdout}\n${longFlag.stderr}`);
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'content', '500-new-leaf.md')),
      true,
      'Expected leaf created with --i'
    );
    assert.match(
      fs.readFileSync(path.join(projectRoot, 'content', '500-new-leaf.md'), 'utf8'),
      /^---\nid: NEW-LEAF-500\nstatus: draft\n---\n\n$/m
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new supports explicit filename via --filename', () => {
  const projectId = `new-leaf-filename-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Manuscript Filename Test',
      requiredMetadata: ['status']
    },
    [
      ['100-first.md', '---\nid: CH-FIRST\nstatus: draft\n---\n\nA\n']
    ]
  );

  try {
    const result = runCli(['new', '--project', projectId, '--filename', '250-custom-scene.md']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const createdPath = path.join(projectRoot, 'content', '250-custom-scene.md');
    assert.equal(fs.existsSync(createdPath), true, `Expected leaf file at ${createdPath}`);

    const created = fs.readFileSync(createdPath, 'utf8');
    assert.match(created, /^---\nid: CUSTOM-SCENE\nstatus: draft\n---\n\n$/m);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new rejects explicit duplicate leaf ids and disambiguates inferred ones', () => {
  const projectId = `new-leaf-duplicate-id-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Leaf Duplicate Id Test',
      requiredMetadata: ['status']
    },
    [
      ['100-first.md', '---\nid: CUSTOM-SCENE\nstatus: draft\n---\n\nA\n'],
      ['200-second.md', '---\nid: CH-SECOND\nstatus: draft\n---\n\nB\n']
    ]
  );

  try {
    const explicitDuplicate = runCli(['new', '--project', projectId, '--id', 'CH-SECOND']);
    assert.equal(explicitDuplicate.status, 1, `${explicitDuplicate.stdout}\n${explicitDuplicate.stderr}`);
    assert.match(`${explicitDuplicate.stdout}\n${explicitDuplicate.stderr}`, /Leaf id 'CH-SECOND' is already used/);

    const inferredDuplicate = runCli(['new', '--project', projectId, '--filename', '250-custom-scene.md']);
    assert.equal(inferredDuplicate.status, 0, `${inferredDuplicate.stdout}\n${inferredDuplicate.stderr}`);
    assert.match(
      fs.readFileSync(path.join(projectRoot, 'content', '250-custom-scene.md'), 'utf8'),
      /^---\nid: CUSTOM-SCENE-250\nstatus: draft\n---\n\n$/m
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new rejects using --filename with --i', () => {
  const projectId = `new-leaf-filename-conflict-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Leaf Filename Conflict Test',
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

test('new creates in an explicit content directory and infers order from local siblings only', () => {
  const projectId = `new-leaf-dir-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Leaf Directory Test',
      requiredMetadata: ['status']
    },
    [
      ['100-root.md', '---\nid: ROOT-ONE\nstatus: draft\n---\n\nRoot\n'],
      ['manuscript/101-first.md', '---\nid: CH-FIRST\nstatus: draft\n---\n\nA\n'],
      ['manuscript/103-second.md', '---\nid: CH-SECOND\nstatus: draft\n---\n\nB\n']
    ]
  );

  try {
    const result = runCli(['new', '--project', projectId, '--dir', 'manuscript']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const createdPath = path.join(projectRoot, 'content', 'manuscript', '105-new-leaf.md');
    assert.equal(fs.existsSync(createdPath), true, `Expected leaf file at ${createdPath}`);
    assert.equal(fs.existsSync(path.join(projectRoot, 'content', '101-new-leaf.md')), false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new scopes explicit filename prefix collisions to the target directory', () => {
  const projectId = `new-leaf-dir-collision-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Leaf Directory Collision Test',
      requiredMetadata: ['status']
    },
    [
      ['200-root-existing.md', '---\nid: ROOT-EXISTING\nstatus: draft\n---\n\nRoot\n'],
      ['manuscript/100-first.md', '---\nid: CH-FIRST\nstatus: draft\n---\n\nA\n']
    ]
  );

  try {
    const result = runCli(['new', '--project', projectId, '--dir', 'manuscript', '--filename', '200-custom-scene.md']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'content', 'manuscript', '200-custom-scene.md')),
      true
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('new rejects target directories outside content', () => {
  const projectId = `new-leaf-dir-invalid-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: 'New Leaf Invalid Directory Test',
      requiredMetadata: ['status']
    },
    []
  );

  try {
    const result = runCli(['new', '--project', projectId, '--dir', '../escape']);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /stay within content\//i);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
