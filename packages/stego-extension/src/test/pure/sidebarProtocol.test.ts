import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSidebarInboundMessage } from '../../features/sidebar/protocol';

test('parseSidebarInboundMessage accepts ready handshake', () => {
  const parsed = parseSidebarInboundMessage({ type: 'ready' });
  assert.deepEqual(parsed, { type: 'ready' });
});

test('parseSidebarInboundMessage accepts known action payload', () => {
  const parsed = parseSidebarInboundMessage({ type: 'spine.openIdentifier', id: 'CHAR-AGNES' });
  assert.equal(parsed?.type, 'spine.openIdentifier');
  assert.equal((parsed as Record<string, unknown>).id, 'CHAR-AGNES');
});

test('parseSidebarInboundMessage rejects unknown type', () => {
  assert.equal(parseSidebarInboundMessage({ type: 'not-real' }), undefined);
});
