import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { App } from './App';
import { createSidebarState } from '../test/fixtures';
import { setWebviewApiForTest } from '../bridge/vscodeApi';
import { resetSidebarState, updateSidebarState } from './store';

describe('App', () => {
  it('posts doc.openExternalLink for markdown links inside rendered content', () => {
    const postedMessages: unknown[] = [];
    setWebviewApiForTest({
      postMessage: (message) => {
        postedMessages.push(message);
      },
      getState: () => ({}),
      setState: () => {
        // no-op
      }
    });

    const root = document.createElement('div');
    document.body.append(root);
    updateSidebarState(createSidebarState({
      comments: {
        selectedId: undefined,
        currentAuthor: 'matt',
        parseErrors: [],
        totalCount: 1,
        unresolvedCount: 1,
        items: [
          {
            id: 'CMT-0001',
            status: 'open',
            anchor: 'paragraph',
            line: 10,
            degraded: false,
            excerpt: 'sample',
            author: 'matt',
            created: '2026-03-01T06:31:35.598Z',
            message: 'See link',
            messageHtml: '<div class=\"md-rendered\" data-base-path=\"/tmp/project/manuscript/001-test.md\"><p><a href=\"https://example.com\">Example</a></p></div>',
            isSelected: false,
            threadPosition: 'first'
          }
        ]
      }
    }));

    const dispose = render(() => <App />, root);

    const anchor = root.querySelector('.md-rendered a[href=\"https://example.com\"]');
    expect(anchor).toBeTruthy();
    anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(postedMessages.some((message) => {
      const payload = message as Record<string, unknown>;
      return payload.type === 'doc.openExternalLink' && payload.url === 'https://example.com';
    })).toBe(true);

    dispose();
    root.remove();
    setWebviewApiForTest(undefined);
    resetSidebarState();
  });

  it('hides images widget when there are no markdown images in the file', () => {
    setWebviewApiForTest(undefined);
    const root = document.createElement('div');
    document.body.append(root);
    updateSidebarState(createSidebarState({ imageEntries: [] }));

    const dispose = render(() => <App />, root);
    expect(root.querySelector('.images-widget')).toBeNull();

    dispose();
    root.remove();
    resetSidebarState();
  });

  it('rerenders when state updates reuse the same object reference', async () => {
    setWebviewApiForTest(undefined);
    const root = document.createElement('div');
    document.body.append(root);

    const sharedState = createSidebarState({ activeTab: 'document', showExplorer: true });
    updateSidebarState(sharedState);

    const dispose = render(() => <App />, root);
    expect(root.querySelector('.sidebar-tab.active')?.textContent).toContain('Document');

    sharedState.activeTab = 'explore';
    updateSidebarState(sharedState);
    await Promise.resolve();

    expect(root.querySelector('.sidebar-tab.active')?.textContent).toContain('Explore');

    dispose();
    root.remove();
    resetSidebarState();
  });
});
