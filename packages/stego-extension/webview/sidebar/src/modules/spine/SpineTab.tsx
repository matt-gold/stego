import { For, Show, type JSX } from 'solid-js';
import type {
  SidebarExplorerPage,
  SidebarPinnedExplorerPanel,
  SidebarWebviewState
} from '@sidebar-protocol';
import {
  BackIcon,
  CollapseIcon,
  ExpandIcon,
  ForwardIcon,
  HomeIcon
} from '../../components/icons';
import { sidebarActions } from '../../actions/actionCreators';
import { dispatchSidebarAction } from '../../actions/dispatch';

function ExplorerBreadcrumbs(props: { page?: SidebarExplorerPage; collapsed: boolean }): JSX.Element {
  return (
    <Show when={props.page && !props.collapsed}>
      <Show when={props.page?.kind === 'home'} fallback={(
        <Show when={props.page?.kind === 'category'} fallback={(
          <div class="explorer-breadcrumbs">
            <button class="explorer-crumb-link" onClick={() => dispatchSidebarAction(sidebarActions.spineHome())}>Home</button>
            <span class="explorer-crumb-separator">/</span>
            <Show when={props.page?.kind === 'identifier' && props.page.category}>
              <button
                class="explorer-crumb-link"
                onClick={() => {
                  if (props.page?.kind === 'identifier' && props.page.category) {
                    dispatchSidebarAction(sidebarActions.openCategory(props.page.category.key, props.page.category.prefix));
                  }
                }}
              >
                {props.page?.kind === 'identifier' ? props.page.category?.label : ''}
              </button>
              <span class="explorer-crumb-separator">/</span>
            </Show>
            <span class="explorer-crumb-current">{props.page?.kind === 'identifier' ? props.page.entry.label : ''}</span>
          </div>
        )}>
          <div class="explorer-breadcrumbs">
            <button class="explorer-crumb-link" onClick={() => dispatchSidebarAction(sidebarActions.spineHome())}>Home</button>
            <span class="explorer-crumb-separator">/</span>
            <span class="explorer-crumb-current">{props.page?.kind === 'category' ? props.page.category.label : ''}</span>
          </div>
        </Show>
      )}>
        <div class="explorer-breadcrumbs"><span class="explorer-crumb-current">Home</span></div>
      </Show>
    </Show>
  );
}

function ExplorerIdentifierCard(props: {
  page: Extract<SidebarExplorerPage, { kind: 'identifier' }>;
  mode: 'active' | 'pinned';
  filterValue: string;
  pinnedId?: string;
  cardActionHtml?: JSX.Element;
}): JSX.Element {
  const entry = () => props.page.entry;
  const showCanonicalId = () => entry().label.trim().toUpperCase() !== entry().id.trim().toUpperCase();
  const showSecondaryTitle = () => entry().title.trim().length > 0
    && entry().title.trim().toUpperCase() !== entry().id.trim().toUpperCase()
    && entry().title.trim().toLocaleUpperCase() !== entry().label.trim().toLocaleUpperCase();
  const toggleAction = () => (props.mode === 'pinned' ? 'togglePinnedExplorerBacklinks' : 'toggleExplorerBacklinks');
  const filterAction = () => (props.mode === 'pinned' ? 'setPinnedBacklinkFilter' : 'setBacklinkFilter');
  const showPinnedSummary = () => props.mode !== 'pinned';
  const panelId = () => props.pinnedId ? props.pinnedId.trim().toUpperCase() : '';
  const filterInstance = () => props.mode === 'pinned' && panelId() ? `pinned:${panelId()}` : 'active';

  return (
    <article class="item metadata-item">
      <div class="item-main">
        <Show when={showPinnedSummary()} fallback={<Show when={!entry().known}><div class="item-title-row"><span class="badge warn">Missing</span></div></Show>}>
          <div class="item-title-row">
            <span class="item-title-text">{entry().label}</span>
            <Show when={!entry().known}><span class="badge warn">Missing</span></Show>
          </div>
        </Show>

        <Show when={showPinnedSummary() && showCanonicalId()}><div class="item-subtext tiny">{entry().id}</div></Show>
        <Show when={showPinnedSummary() && showSecondaryTitle()}><div class="item-subtext">{entry().title}</div></Show>

        <Show when={entry().sourceFilePath && entry().sourceLine}>
          <div class="explorer-source-row">
            <span class="tiny-label">Source</span>
            <button
              class="backlink-link"
              onClick={() => {
                if (entry().sourceFilePath && entry().sourceLine) {
                  dispatchSidebarAction(sidebarActions.openBacklink(entry().sourceFilePath, entry().sourceLine));
                }
              }}
            >
              {entry().sourceFileLabel ?? entry().sourceFilePath}:{entry().sourceLine}
            </button>
          </div>
        </Show>

        <Show when={entry().sourceBodyHtml}>
          <div class="explorer-body" innerHTML={entry().sourceBodyHtml ?? ''}></div>
        </Show>

        <div class="backlink-section">
          <div class="item-title-row">
            <button
              class="btn subtle inline-toggle"
              onClick={() => {
                if (props.mode === 'pinned' && panelId()) {
                  dispatchSidebarAction(sidebarActions.togglePinnedBacklinks(panelId()));
                  return;
                }
                dispatchSidebarAction(sidebarActions.toggleSpineBacklinks());
              }}
            >
              {entry().backlinks.length} references{entry().backlinksExpanded ? ' (hide)' : ''}
            </button>
          </div>

          <Show when={entry().backlinksExpanded}>
            <div class="filter-row filter-row-tight">
              <input
                class="filter-input"
                type="text"
                value={props.filterValue}
                placeholder="Filter references by filename"
                onInput={(event) => {
                  const value = event.currentTarget.value;
                  if (props.mode === 'pinned' && panelId()) {
                    dispatchSidebarAction(sidebarActions.setPinnedBacklinkFilter(panelId(), value));
                    return;
                  }
                  dispatchSidebarAction(sidebarActions.setBacklinkFilter(value));
                }}
              />
            </div>
            <Show when={entry().backlinks.length > 0} fallback={<div class="empty tiny">No references found.</div>}>
              <For each={entry().backlinks}>{(backlink) => (
                <div class="backlink-row">
                  <button class="backlink-link" onClick={() => dispatchSidebarAction(sidebarActions.openBacklink(backlink.filePath, backlink.line))}>
                    {backlink.fileLabel}
                  </button>
                  <span class="badge">{backlink.count}x</span>
                  <div class="item-subtext">{backlink.excerpt}</div>
                </div>
              )}</For>
            </Show>
          </Show>
        </div>
      </div>
      <Show when={props.cardActionHtml}><div class="item-actions explorer-card-actions">{props.cardActionHtml}</div></Show>
    </article>
  );
}

function ExplorerBody(props: {
  page?: SidebarExplorerPage;
  mode: 'active' | 'pinned';
  collapsed: boolean;
  filterValue: string;
  pinnedId?: string;
  cardActionHtml?: JSX.Element;
}): JSX.Element {
  return (
    <Show when={props.page} fallback={<div class="empty">Click an identifier to inspect it here.</div>}>
      <Show when={!props.collapsed}>
        <Show when={props.page?.kind === 'home'} fallback={(
          <Show when={props.page?.kind === 'category'} fallback={(
            <Show when={props.page?.kind === 'identifier'}>
              <ExplorerIdentifierCard
                page={props.page as Extract<SidebarExplorerPage, { kind: 'identifier' }>}
                mode={props.mode}
                filterValue={props.filterValue}
                pinnedId={props.pinnedId}
                cardActionHtml={props.cardActionHtml}
              />
            </Show>
          )}>
            <article class="item metadata-item">
              <div class="item-main">
                <div class="item-title-row">
                  <span class="item-title-text">{props.page?.kind === 'category' ? props.page.category.label : ''}</span>
                  <span class="badge">{props.page?.kind === 'category' ? props.page.items.length : 0}</span>
                </div>
                <Show
                  when={props.page?.kind === 'category' && props.page.items.length > 0}
                  fallback={<div class="empty tiny">No spine entries found for this category.</div>}
                >
                  <div class="explorer-list">
                    <For each={props.page?.kind === 'category' ? props.page.items : []}>{(item) => {
                      const showCanonicalId = item.label.trim().toUpperCase() !== item.id.trim().toUpperCase();
                      const showSecondaryTitle = item.title.trim().length > 0
                        && item.title.trim().toUpperCase() !== item.id.trim().toUpperCase()
                        && item.title.trim().toLocaleUpperCase() !== item.label.trim().toLocaleUpperCase();

                      return (
                        <div class="explorer-list-row">
                          <button class="id-link" onClick={() => dispatchSidebarAction(sidebarActions.openIdentifier(item.id))}>{item.label}</button>
                          <Show when={showCanonicalId}><span class="item-subtext tiny">{item.id}</span></Show>
                          <Show when={showSecondaryTitle}><span class="item-subtext">{item.title}</span></Show>
                          <Show when={!item.known}><span class="badge warn">Missing</span></Show>
                          <Show when={item.description}><div class="item-subtext">{item.description}</div></Show>
                        </div>
                      );
                    }}</For>
                  </div>
                </Show>
              </div>
            </article>
          </Show>
        )}>
          <article class="item metadata-item explorer-home-card">
            <div class="item-main">
              <Show when={props.page?.kind === 'home' && props.page.categories.length > 0} fallback={<div class="empty">No spine categories found in this project.</div>}>
                <div class="explorer-list">
                  <For each={props.page?.kind === 'home' ? props.page.categories : []}>{(category) => (
                    <div class="explorer-list-row">
                      <button class="id-link" onClick={() => dispatchSidebarAction(sidebarActions.openCategory(category.key, category.prefix))}>{category.label}</button>
                      <span class="badge">{category.count}</span>
                    </div>
                  )}</For>
                </div>
              </Show>
            </div>
            <Show when={props.mode === 'active'}>
              <div class="item-actions explorer-home-actions"><button class="btn subtle" onClick={() => dispatchSidebarAction(sidebarActions.createSpineCategory())}>+ New Category</button></div>
            </Show>
          </article>
        </Show>
      </Show>
    </Show>
  );
}

function PinnedPanel(props: { panel: SidebarPinnedExplorerPanel }): JSX.Element {
  const collapseLabel = () => props.panel.collapsed ? 'Expand pinned panel' : 'Collapse pinned panel';
  const unpinLabel = () => `Unpin ${props.panel.page.entry.label}`;

  return (
    <section class={`panel explorer-panel explorer-panel-pinned${props.panel.collapsed ? ' collapsed' : ''}`} data-pinned-id={props.panel.id}>
      <div class="panel-heading">
        <h2>{props.panel.page.entry.label}</h2>
        <div class="explorer-nav explorer-nav-pinned">
          <span class="panel-kind-badge">Pinned</span>
          <button class="btn subtle btn-icon" onClick={() => dispatchSidebarAction(sidebarActions.togglePinnedCollapse(props.panel.id))} aria-label={collapseLabel()} title={collapseLabel()}>
            {props.panel.collapsed ? <ExpandIcon /> : <CollapseIcon />}
          </button>
          <button class="btn subtle btn-icon explorer-unpin-btn" onClick={() => dispatchSidebarAction(sidebarActions.unpinEntry(props.panel.id))} aria-label={unpinLabel()} title={unpinLabel()}>×</button>
        </div>
      </div>
      <ExplorerBody page={props.panel.page} mode="pinned" collapsed={props.panel.collapsed} filterValue={props.panel.backlinkFilter} pinnedId={props.panel.id} />
    </section>
  );
}

export function SpineTab(props: { state: SidebarWebviewState }): JSX.Element {
  const activeIdentifierId = () => props.state.explorer?.kind === 'identifier' ? props.state.explorer.entry.id.trim().toUpperCase() : '';
  const pinnedIdentifiers = () => new Set(props.state.pinnedExplorers.map((panel) => panel.id.trim().toUpperCase()));
  const showPinButton = () => !!activeIdentifierId() && !pinnedIdentifiers().has(activeIdentifierId());

  return (
    <Show when={props.state.showExplorer} fallback={<div class="empty-panel">No spine categories found in this project.</div>}>
      <div class="spine-panel-stack">
        <For each={props.state.pinnedExplorers}>{(panel) => <PinnedPanel panel={panel} />}</For>

        <section class="panel explorer-panel">
          <div class="panel-heading">
            <h2>Spine</h2>
            <div class="explorer-nav">
              <button class="btn subtle btn-icon" onClick={() => dispatchSidebarAction(sidebarActions.spineBack())} disabled={!props.state.explorerCanGoBack} aria-label="Back" title="Back"><BackIcon /></button>
              <button class="btn subtle btn-icon" onClick={() => dispatchSidebarAction(sidebarActions.spineForward())} disabled={!props.state.explorerCanGoForward} aria-label="Forward" title="Forward"><ForwardIcon /></button>
              <button class="btn subtle btn-icon" onClick={() => dispatchSidebarAction(sidebarActions.spineHome())} disabled={!props.state.explorerCanGoHome} aria-label="Home" title="Home"><HomeIcon /></button>
            </div>
          </div>

          <ExplorerBreadcrumbs page={props.state.explorer} collapsed={false} />
          <ExplorerBody
            page={props.state.explorer}
            mode="active"
            collapsed={false}
            filterValue={props.state.backlinkFilter}
            cardActionHtml={showPinButton() ? <button class="btn subtle explorer-pin-btn" onClick={() => dispatchSidebarAction(sidebarActions.pinActiveSpineEntry())}>Pin</button> : undefined}
          />
        </section>
      </div>
    </Show>
  );
}
