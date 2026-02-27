import test from 'node:test';
import assert from 'node:assert/strict';
import { slugifyHeading } from '../../shared/markdown';

test('slugifyHeading normalizes heading text', () => {
  assert.equal(slugifyHeading('CHAR-MATTHAEUS Magister Matthaeus de Rota'), 'char-matthaeus-magister-matthaeus-de-rota');
  assert.equal(slugifyHeading('  The Fall of Rome  '), 'the-fall-of-rome');
  assert.equal(slugifyHeading('A*B~C`'), 'abc');
});
