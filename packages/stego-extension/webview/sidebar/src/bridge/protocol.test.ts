import { describe, expect, it } from 'vitest';
import { parseSidebarHostMessage } from './protocol';

describe('parseSidebarHostMessage', () => {
  it('accepts state messages', () => {
    const parsed = parseSidebarHostMessage({ type: 'state', state: { activeTab: 'document' } });
    expect(parsed).toBeDefined();
    expect(parsed?.type).toBe('state');
  });

  it('rejects unknown payloads', () => {
    expect(parseSidebarHostMessage({ type: 'other' })).toBeUndefined();
    expect(parseSidebarHostMessage(null)).toBeUndefined();
    expect(parseSidebarHostMessage(undefined)).toBeUndefined();
  });
});
