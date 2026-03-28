import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCliFailureDetails } from '../../shared/cli/errorDetails';

test('pickCliFailureDetails prefers structured CLI error envelopes', () => {
  const stderr = JSON.stringify({ ok: false, message: 'Invalid stego-span color value.' });
  assert.equal(pickCliFailureDetails('', stderr), 'Invalid stego-span color value.');
});

test('pickCliFailureDetails prefers ERROR lines over npm trailer noise', () => {
  const stderr = [
    'ERROR: Invalid markdown directive syntax \'<stego-span underline>\'. Attributes must use quoted HTML-style values.',
    'npm error Lifecycle script `export` failed with error:',
    'npm error command sh -c stego export --project funny-business'
  ].join('\n');

  assert.equal(
    pickCliFailureDetails('', stderr),
    'Invalid markdown directive syntax \'<stego-span underline>\'. Attributes must use quoted HTML-style values.'
  );
});

test('pickCliFailureDetails falls back to the first meaningful non-noise line', () => {
  const stderr = [
    '> export',
    'node:internal/modules/esm/resolve:275',
    'Template render() must return <Stego.Document>.',
    'at renderDocument (render.js:12:3)',
    'npm error code 1'
  ].join('\n');

  assert.equal(pickCliFailureDetails('', stderr), 'Template render() must return <Stego.Document>.');
});
