import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../shared/constants';
import {
  collectIdentifierOccurrencesFromLines,
  extractIdentifierTokensFromValue
} from '../../features/identifiers/identifierExtraction';

test('extractIdentifierTokensFromValue finds multi-token identifiers', () => {
  const tokens = extractIdentifierTokensFromValue('Uses SRC-WARD-DATA and SRC-WARD-DATA twice', DEFAULT_IDENTIFIER_PATTERN);
  assert.deepEqual(tokens, ['SRC-WARD-DATA']);
});

test('collectIdentifierOccurrencesFromLines respects code fence toggle', () => {
  const lines = [
    'Plain CHAR-ONE',
    '```',
    'Inside fence CHAR-TWO',
    '```',
    'Plain SRC-WARD-DATA'
  ];

  const withoutFences = collectIdentifierOccurrencesFromLines(lines, DEFAULT_IDENTIFIER_PATTERN, false)
    .map((entry) => entry.id);
  assert.deepEqual(withoutFences, ['CHAR-ONE', 'SRC-WARD-DATA']);

  const withFences = collectIdentifierOccurrencesFromLines(lines, DEFAULT_IDENTIFIER_PATTERN, true)
    .map((entry) => entry.id);
  assert.deepEqual(withFences, ['CHAR-ONE', 'CHAR-TWO', 'SRC-WARD-DATA']);
});
