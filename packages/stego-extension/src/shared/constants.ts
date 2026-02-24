import * as yaml from 'js-yaml';

export const METADATA_VIEW_ID = 'stegoSpine.metadataView';
export const DEFAULT_IDENTIFIER_PATTERN = '\\b[A-Z][A-Z0-9]*-[A-Z0-9]+(?:-[A-Z0-9]+)*\\b';
export const DEFAULT_ALLOWED_STATUSES = ['draft', 'revise', 'line-edit', 'proof', 'final'];
export const FRONTMATTER_YAML_SCHEMA = yaml.JSON_SCHEMA;
export const SPINE_DIR = 'spine';

export const MINOR_TITLE_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'so',
  'yet',
  'as',
  'at',
  'by',
  'in',
  'of',
  'on',
  'per',
  'to',
  'via'
]);
