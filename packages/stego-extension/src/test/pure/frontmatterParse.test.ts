import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orderFrontmatterStatusFirst,
  parseMarkdownDocument,
  serializeMarkdownDocument
} from '../../features/metadata/frontmatterParse';

test('parseMarkdownDocument parses yaml frontmatter object', () => {
  const parsed = parseMarkdownDocument('---\nstatus: draft\ncharacters:\n  - CHAR-ONE\n---\n\nBody');
  assert.equal(parsed.hasFrontmatter, true);
  assert.equal(parsed.frontmatter.status, 'draft');
  assert.deepEqual(parsed.frontmatter.characters, ['CHAR-ONE']);
  assert.equal(parsed.body, '\nBody');
});

test('parseMarkdownDocument throws when frontmatter root is not object', () => {
  assert.throws(
    () => parseMarkdownDocument('---\n- not-an-object\n---\nBody'),
    /Frontmatter must be a YAML object/
  );
});

test('serializeMarkdownDocument keeps status as first key', () => {
  const ordered = orderFrontmatterStatusFirst({
    characters: ['CHAR-ONE'],
    status: 'line-edit',
    locations: ['LOC-ONE']
  });

  const keys = Object.keys(ordered);
  assert.equal(keys[0], 'status');

  const serialized = serializeMarkdownDocument({
    lineEnding: '\n',
    hasFrontmatter: true,
    frontmatter: {
      characters: ['CHAR-ONE'],
      status: 'line-edit',
      locations: ['LOC-ONE']
    },
    body: 'Body text'
  });

  assert.match(serialized, /^---\nstatus: line-edit\n/);
});

test('array frontmatter roundtrips through parse and serialize', () => {
  const parsed = parseMarkdownDocument('---\nstatus: draft\ncharacters:\n  - CHAR-ONE\n---\n\nBody');
  const characters = parsed.frontmatter.characters as string[];
  characters.push('CHAR-TWO');
  parsed.frontmatter.characters = characters;

  const serialized = serializeMarkdownDocument(parsed);
  assert.match(serialized, /characters:\n  - CHAR-ONE\n  - CHAR-TWO/);
});
