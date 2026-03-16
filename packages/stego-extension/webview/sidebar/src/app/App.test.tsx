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

  it('renders template links with export target badges in the manuscript tab', () => {
    setWebviewApiForTest(undefined);
    const root = document.createElement('div');
    document.body.append(root);
    updateSidebarState(createSidebarState({
      activeTab: 'overview',
      overview: {
        manuscriptTitle: 'Test Manuscript',
        generatedAt: '2026-03-01T06:31:35.598Z',
        wordCount: 1200,
        manuscriptFileCount: 3,
        missingRequiredMetadataCount: 0,
        unresolvedCommentsCount: 0,
        gateSnapshot: {
          stageCheck: { state: 'never' },
          build: { state: 'never' }
        },
        stageBreakdown: [],
        mapRows: []
      },
      templates: [
        {
          name: 'book',
          path: '/tmp/project/templates/book.template.tsx',
          relativePath: 'templates/book.template.tsx',
          supportedTargets: ['md', 'docx', 'pdf']
        },
        {
          name: 'web',
          path: '/tmp/project/templates/web.template.tsx',
          relativePath: 'templates/web.template.tsx',
          supportedTargets: ['epub']
        }
      ]
    }));

    const dispose = render(() => <App />, root);

    expect(root.textContent).toContain('Templates');
    expect(root.textContent).toContain('book');
    expect(root.textContent).toContain('web');
    expect(root.textContent).toContain('md');
    expect(root.textContent).toContain('docx');
    expect(root.textContent).toContain('pdf');
    expect(root.textContent).toContain('epub');
    expect(root.textContent).toContain('templates/book.template.tsx');

    dispose();
    root.remove();
    resetSidebarState();
  });

  it('shows manuscript loading state immediately before overview data is ready', () => {
    setWebviewApiForTest(undefined);
    const root = document.createElement('div');
    document.body.append(root);
    updateSidebarState(createSidebarState({
      activeTab: 'overview',
      overviewLoading: true,
      templates: [
        {
          name: 'book',
          path: '/tmp/project/templates/book.template.tsx',
          relativePath: 'templates/book.template.tsx',
          supportedTargets: ['md', 'docx']
        }
      ]
    }));

    const dispose = render(() => <App />, root);

    expect(root.textContent).toContain('Loading manuscript overview');
    expect(root.textContent).toContain('Templates');
    expect(root.textContent).toContain('book');

    dispose();
    root.remove();
    resetSidebarState();
  });

  it('shows combined child counts for branch lists in explore', () => {
    setWebviewApiForTest(undefined);
    const root = document.createElement('div');
    document.body.append(root);
    updateSidebarState(createSidebarState({
      activeTab: 'explore',
      explorer: {
        kind: 'branch',
        branch: {
          id: 'reference',
          name: 'reference',
          label: 'Reference',
          directBranchCount: 2,
          directLeafCount: 0,
          directChildCount: 2
        },
        childBranches: [
          {
            id: 'reference/characters',
            name: 'characters',
            label: 'Characters',
            parentId: 'reference',
            directBranchCount: 3,
            directLeafCount: 0,
            directChildCount: 3
          }
        ],
        leafItems: []
      }
    }));

    const dispose = render(() => <App />, root);

    const row = [...root.querySelectorAll('.explorer-list-row')].find((entry) => entry.textContent?.includes('Characters'));
    expect(row?.textContent).toContain('3');

    dispose();
    root.remove();
    resetSidebarState();
  });
});
