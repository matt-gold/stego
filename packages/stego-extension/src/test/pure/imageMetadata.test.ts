import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSidebarImageEntries,
  parseProjectImageDefaults,
  parseImageOverrideInput,
  readImageOverride,
  setImageOverride
} from '../../features/metadata/imageMetadata';

test('buildSidebarImageEntries detects markdown images and applies project defaults', () => {
  const entries = buildSidebarImageEntries({
    body: 'Intro\n\n![Map](../assets/maps/city.png)\n',
    frontmatter: {},
    chapterPath: '/tmp/project/manuscript/010-opening.md',
    projectDir: '/tmp/project',
    projectDefaults: { width: '50%', classes: ['illustration'] }
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, 'assets/maps/city.png');
  assert.equal(entries[0].displayPath, 'assets/maps/city.png');
  assert.equal(entries[0].line, 3);
  assert.equal(entries[0].hasOverride, false);
  assert.equal(entries[0].effectiveStyle.width, '50%');
  assert.deepEqual(entries[0].effectiveStyle.classes, ['illustration']);
});

test('buildSidebarImageEntries applies manuscript overrides by project-relative path key', () => {
  const entries = buildSidebarImageEntries({
    body: '![Map](../assets/maps/city.png)\n',
    frontmatter: {
      images: {
        'assets/maps/city.png': {
          layout: 'inline',
          align: 'left',
          width: '100%'
        }
      }
    },
    chapterPath: '/tmp/project/manuscript/010-opening.md',
    projectDir: '/tmp/project',
    projectDefaults: { layout: 'block', align: 'center', width: '50%' }
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].hasOverride, true);
  assert.equal(entries[0].defaultStyle.layout, 'block');
  assert.equal(entries[0].defaultStyle.align, 'center');
  assert.equal(entries[0].overrideStyle.layout, 'inline');
  assert.equal(entries[0].overrideStyle.align, 'left');
  assert.equal(entries[0].effectiveStyle.layout, 'inline');
  assert.equal(entries[0].effectiveStyle.align, 'left');
  assert.equal(entries[0].defaultStyle.width, '50%');
  assert.equal(entries[0].overrideStyle.width, '100%');
  assert.equal(entries[0].effectiveStyle.width, '100%');
});

test('setImageOverride writes and removes frontmatter image override keys', () => {
  const frontmatter: Record<string, unknown> = {};
  setImageOverride(frontmatter, 'assets/maps/city.png', {
    width: '75%',
    classes: ['full-bleed']
  });

  const override = readImageOverride(frontmatter, 'assets/maps/city.png');
  assert.equal(override?.width, '75%');
  assert.deepEqual(override?.classes, ['full-bleed']);

  setImageOverride(frontmatter, 'assets/maps/city.png', undefined);
  assert.equal(readImageOverride(frontmatter, 'assets/maps/city.png'), undefined);
  assert.equal(Object.hasOwn(frontmatter, 'images'), false);
});

test('parseProjectImageDefaults reads only global image keys', () => {
  const defaults = parseProjectImageDefaults({
    images: {
      layout: 'block',
      align: 'center',
      width: '60%',
      attrs: { loading: 'lazy' },
      'assets/maps/city.png': { width: '100%' }
    }
  });

  assert.equal(defaults.layout, 'block');
  assert.equal(defaults.align, 'center');
  assert.equal(defaults.width, '60%');
  assert.deepEqual(defaults.attrs, { loading: 'lazy' });
  assert.equal((defaults as Record<string, unknown>)['assets/maps/city.png'], undefined);
});

test('parseImageOverrideInput ignores unknown keys and requires at least one style key', () => {
  const parsed = parseImageOverrideInput({
    layout: 'inline',
    align: 'left',
    width: '80%',
    unknown: 'value'
  });
  assert.equal(parsed?.layout, 'inline');
  assert.equal(parsed?.align, 'left');
  assert.equal(parsed?.width, '80%');
  assert.equal((parsed as Record<string, unknown>)?.unknown, undefined);

  const empty = parseImageOverrideInput({ unknown: 'value' });
  assert.equal(empty, undefined);
});
