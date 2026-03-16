import { createEffect, createMemo, For, Match, onCleanup, onMount, Show, Switch, type JSX } from 'solid-js';
import { getWebviewApi } from '../bridge/vscodeApi';
import { DocumentTab } from '../modules/document/DocumentTab';
import { ExploreTab } from '../modules/explore/ExploreTab';
import { OverviewTab } from '../modules/overview/OverviewTab';
import { BackIcon, ForwardIcon } from '../components/icons';
import { useSidebarState } from './store';
import { sidebarActions } from '../actions/actionCreators';
import { dispatchSidebarAction } from '../actions/dispatch';
import { linkifyExplorerIdentifiers } from './utils';

export function App(): JSX.Element {
  const state = useSidebarState();

  const persistentState = (getWebviewApi().getState<{ lastExplorerLoadToken?: number; lastActiveTab?: string; lastSelectedCommentId?: string }>() ?? {});
  let lastExplorerLoadToken = Number(persistentState.lastExplorerLoadToken ?? 0);
  let lastActiveTab = persistentState.lastActiveTab ?? '';
  let lastSelectedCommentId = (persistentState.lastSelectedCommentId ?? '').trim().toUpperCase();

  createEffect(() => {
    const current = state();
    if (!current) {
      return;
    }

    queueMicrotask(() => {
      for (const markdownContainer of document.querySelectorAll('.md-rendered')) {
        if (markdownContainer instanceof HTMLElement) {
          linkifyExplorerIdentifiers(markdownContainer);
        }
      }

      const explorerLoadToken = Number(current.explorerLoadToken || 0);
      const didLoadNewExplorer = Number.isFinite(explorerLoadToken)
        && explorerLoadToken > 0
        && explorerLoadToken !== lastExplorerLoadToken;
      if (didLoadNewExplorer) {
        const activeExplorerPanel = document.querySelector('.explorer-panel:not(.explorer-panel-pinned)');
        if (activeExplorerPanel instanceof HTMLElement) {
          const stickyTabs = document.querySelector('.sidebar-tabs');
          const stickyOffset = stickyTabs instanceof HTMLElement ? (stickyTabs.offsetHeight + 4) : 0;
          const targetTop = Math.max(0, window.scrollY + activeExplorerPanel.getBoundingClientRect().top - stickyOffset);
          window.scrollTo({ top: targetTop, behavior: 'auto' });
        }
      }

      const selectedCommentId = (current.comments.selectedId ?? '').trim().toUpperCase();
      const shouldScrollToSelectedComment = (
        current.activeTab === 'document'
        && selectedCommentId.length > 0
        && (selectedCommentId !== lastSelectedCommentId || lastActiveTab !== 'document')
      );
      if (shouldScrollToSelectedComment) {
        const selectedComment = document.querySelector(`.comment-list-item.selected[data-id="${selectedCommentId}"]`);
        if (selectedComment instanceof HTMLElement) {
          selectedComment.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      }

      lastExplorerLoadToken = explorerLoadToken;
      lastActiveTab = current.activeTab;
      lastSelectedCommentId = selectedCommentId;
      getWebviewApi().setState({
        lastExplorerLoadToken,
        lastActiveTab,
        lastSelectedCommentId
      });
    });
  });

  const onDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const markdownLink = target.closest('.md-rendered a[href]');
    if (markdownLink instanceof HTMLAnchorElement) {
      event.preventDefault();
      const container = markdownLink.closest('.md-rendered');
      const basePath = container ? (container.getAttribute('data-base-path') || '') : '';
      dispatchSidebarAction(sidebarActions.openExternalLink(markdownLink.getAttribute('href') || '', basePath));
      return;
    }

    const identifierButton = target.closest('.md-id-link');
    if (identifierButton instanceof HTMLElement) {
      const id = identifierButton.dataset.identifierId;
      if (id) {
        dispatchSidebarAction(sidebarActions.openIdentifier(id));
      }
    }
  };

  onMount(() => {
    document.addEventListener('click', onDocumentClick);
  });

  onCleanup(() => {
    document.removeEventListener('click', onDocumentClick);
  });

  const showDocumentTab = createMemo(() => {
    const current = state();
    if (!current) {
      return false;
    }
    return current.showDocumentTab ?? current.hasActiveMarkdown;
  });

  return (
    <div class="sidebar-root">
      <Show when={state()} fallback={<div class="empty-panel">Loading Stego sidebar…</div>}>
        {(currentAccessor) => {
          const current = createMemo(currentAccessor);
          const showExploreTabActions = () => current().activeTab === 'explore' && current().showExplorer && current().hasActiveMarkdown;

          return (
            <>
              <Show when={showDocumentTab() || current().showExplorer || current().canShowOverview}>
                <div class="sidebar-tabs">
                  <div class="sidebar-tabs-main">
                    <Show when={showDocumentTab()}>
                      <button class={`sidebar-tab${current().activeTab === 'document' ? ' active' : ''}`} onClick={() => dispatchSidebarAction(sidebarActions.setTab('document'))}>Document</button>
                    </Show>
                    <Show when={current().showExplorer}>
                      <button class={`sidebar-tab${current().activeTab === 'explore' ? ' active' : ''}`} onClick={() => dispatchSidebarAction(sidebarActions.setTab('explore'))}>Explore</button>
                    </Show>
                    <Show when={current().canShowOverview}>
                      <button class={`sidebar-tab${current().activeTab === 'overview' ? ' active' : ''}`} onClick={() => dispatchSidebarAction(sidebarActions.setTab('overview'))}>Manuscript</button>
                    </Show>
                  </div>
                  <div class="sidebar-tabs-nav">
                    <button class="btn subtle btn-icon" onClick={() => dispatchSidebarAction(sidebarActions.globalBack())} disabled={!current().globalCanGoBack} aria-label="Back" title="Back"><BackIcon /></button>
                    <button class="btn subtle btn-icon" onClick={() => dispatchSidebarAction(sidebarActions.globalForward())} disabled={!current().globalCanGoForward} aria-label="Forward" title="Forward"><ForwardIcon /></button>
                  </div>
                </div>
              </Show>

              <Show when={showExploreTabActions()}>
                <div class="explore-tab-actions-row">
                  <div class="sidebar-tabs-actions">
                    <button class="btn subtle" onClick={() => dispatchSidebarAction(sidebarActions.pinAllFromDocument())} disabled={!current().canPinAllFromFile}>Pin All From File</button>
                    <Show when={current().pinnedExplorers.length > 0}>
                      <button class="btn subtle" onClick={() => dispatchSidebarAction(sidebarActions.unpinAll())}>Unpin All</button>
                    </Show>
                  </div>
                </div>
              </Show>

              <Show when={current().warnings.length > 0}>
                <div class="warning-panel">
                  <For each={current().warnings}>{(warning, index) => (
                    <>
                      {index() > 0 ? <br /> : null}
                      {warning}
                    </>
                  )}</For>
                </div>
              </Show>

              <Switch>
                <Match when={current().activeTab === 'overview'}>
                  <OverviewTab state={current()} />
                </Match>
                <Match when={current().activeTab === 'explore'}>
                  <ExploreTab state={current()} />
                </Match>
                <Match when={current().documentTabDetached}>
                  <DocumentTab state={current()} />
                </Match>
                <Match when={!current().hasActiveMarkdown && current().canShowOverview}>
                  <div class="empty-panel">Overview is available for this project.</div>
                </Match>
                <Match when={!current().hasActiveMarkdown}>
                  <div class="empty-panel">Open a Markdown document to use the Stego sidebar.</div>
                </Match>
                <Match when={true}>
                  <DocumentTab state={current()} />
                </Match>
              </Switch>
            </>
          );
        }}
      </Show>
    </div>
  );
}
