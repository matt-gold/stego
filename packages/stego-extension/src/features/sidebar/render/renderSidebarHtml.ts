import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../../shared/constants';
import type {
  SidebarExplorerIdentifierPage,
  SidebarExplorerPage,
  SidebarIdentifierLink,
  SidebarPinnedExplorerPanel,
  SidebarState
} from '../../../shared/types';
import { getSidebarFileTitle } from '../sidebarToc';
import { getSidebarAssetUris } from './sidebarAssetUris';
import { renderMarkdownForExplorer } from './renderMarkdownForExplorer';
import { escapeAttribute, escapeHtml, randomNonce } from './renderUtils';

dayjs.extend(relativeTime);

function gateStateBadgeClass(state: 'never' | 'success' | 'failed'): string {
  switch (state) {
    case 'success':
      return 'state-success';
    case 'failed':
      return 'state-failed';
    case 'never':
    default:
      return 'state-neutral';
  }
}

function gateStateLabel(state: 'never' | 'success' | 'failed'): string {
  switch (state) {
    case 'success':
      return 'success';
    case 'failed':
      return 'failed';
    case 'never':
    default:
      return 'not run yet';
  }
}

export function renderSidebarHtml(webview: vscode.Webview, state: SidebarState, extensionUri: vscode.Uri): string {
  const nonce = randomNonce();
  const fileTitle = getSidebarFileTitle(state.documentPath);
  const showDocumentTab = state.showDocumentTab ?? state.hasActiveMarkdown;
  const showMetadataEditingControls = state.mode === 'manuscript' && state.metadataEditing;
  const renderReferenceCards = (references: SidebarIdentifierLink[]): string => {
    if (references.length === 0) {
      return '';
    }

    return `<div class="meta-reference-list">`
      + references.map((reference) => {
        const status = reference.known
          ? ''
          : '<span class="badge warn">Missing</span>';
        const showTitle = reference.title.trim().length > 0
          && reference.title.trim().toUpperCase() !== reference.id.toUpperCase();
        const title = showTitle ? `<span class="item-title-text">${escapeHtml(reference.title)}</span>` : '';
        const refLabel = `<button class="id-link" data-action="openIdentifier" data-id="${escapeAttribute(reference.id)}">${escapeHtml(reference.id)}</button>`;
        const description = reference.description
          ? `<div class="item-subtext">${escapeHtml(reference.description)}</div>`
          : '';

        return `<div class="meta-reference">`
          + `<div class="item-title-row">${refLabel}${title}${status}</div>`
          + `${description}`
          + `</div>`;
      }).join('')
      + `</div>`;
  };

  const metadataHtml = state.metadataEntries.length > 0
    ? state.metadataEntries.map((entry) => {
      if (entry.isArray) {
        const arrayItems = entry.arrayItems.length > 0
          ? `<div class="array-list">`
            + entry.arrayItems.map((item) => `<div class="array-item">`
              + `<div class="item-main">`
              + `<div class="item-subtext metadata-value">${escapeHtml(item.valueText)}</div>`
              + `${renderReferenceCards(item.references)}`
              + `</div>`
              + `${showMetadataEditingControls
                ? `<div class="item-actions">`
                  + `<button class="btn subtle" data-action="editMetadataArrayItem" data-key="${escapeAttribute(entry.key)}" data-index="${item.index}">Edit</button>`
                  + `<button class="btn danger" data-action="removeMetadataArrayItem" data-key="${escapeAttribute(entry.key)}" data-index="${item.index}">Remove</button>`
                  + `</div>`
                : ''}`
              + `</div>`).join('')
            + `</div>`
          : '<div class="empty tiny">No items in this array.</div>';

        return `<article class="item metadata-item metadata-array-field">`
          + `<div class="item-main">`
          + `<div class="item-title-row"><code>${escapeHtml(entry.key)}</code>${entry.isStructural ? '<span class="badge structural">Structural</span>' : ''}${entry.isSpineCategory ? '<span class="badge spine">Spine</span>' : ''}<span class="badge">${entry.arrayItems.length} items</span></div>`
          + `${arrayItems}`
          + `${showMetadataEditingControls
            ? `<div class="array-field-actions">`
              + `<button class="btn subtle" data-action="addMetadataArrayItem" data-key="${escapeAttribute(entry.key)}">Add Item</button>`
              + `</div>`
            : ''}`
          + `</div>`
          + `</article>`;
      }

      return `<article class="item metadata-item">`
        + `<div class="item-main">`
        + `<div class="item-title-row"><code>${escapeHtml(entry.key)}</code>${entry.isStructural ? '<span class="badge structural">Structural</span>' : ''}${entry.isSpineCategory ? '<span class="badge spine">Spine</span>' : ''}</div>`
        + `<div class="item-subtext metadata-value">${escapeHtml(entry.valueText)}</div>`
        + `${renderReferenceCards(entry.references)}`
        + `</div>`
        + `${showMetadataEditingControls
          ? `<div class="item-actions">`
            + `<button class="btn subtle" data-action="editMetadataField" data-key="${escapeAttribute(entry.key)}">Edit</button>`
            + `<button class="btn danger" data-action="removeMetadataField" data-key="${escapeAttribute(entry.key)}">Remove</button>`
            + `</div>`
          : ''}`
        + `</article>`;
    }).join('')
    : '<div class="empty">No metadata fields yet.</div>';

  const currentStageLabel = state.mode === 'manuscript'
    ? state.statusControl?.value?.trim() || state.statusControl?.invalidValue?.trim() || 'stage'
    : 'stage';
  const runLocalChecksLabel = `Run ${currentStageLabel} check`;
  const runLocalChecksIcon = '<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.78 3.97a.75.75 0 0 1 0 1.06L6.75 12.06a.75.75 0 0 1-1.06 0L2.22 8.59a.75.75 0 1 1 1.06-1.06l2.94 2.94 6.5-6.5a.75.75 0 0 1 1.06 0z"></path></svg>';
  const copyCleanManuscriptLabel = 'Copy manuscript text';
  const copyCleanManuscriptIcon = '<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.75A1.75 1.75 0 0 1 6.75 1h6.5A1.75 1.75 0 0 1 15 2.75v8.5A1.75 1.75 0 0 1 13.25 13h-6.5A1.75 1.75 0 0 1 5 11.25zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25z"></path><path d="M1 4.75A1.75 1.75 0 0 1 2.75 3h.5a.75.75 0 0 1 0 1.5h-.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-.5a.75.75 0 0 1 1.5 0v.5A1.75 1.75 0 0 1 9.25 15h-6.5A1.75 1.75 0 0 1 1 13.25z"></path></svg>';
  const openMetricTargetLabel = 'Open next file';
  const openMetricTargetIcon = '<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 3L5.4 4.1 9.3 8l-3.9 3.9L6.5 13l5-5z"></path></svg>';
  const runStageLabel = 'Run Stage Check';
  const runBuildLabel = 'Run Build';
  const runBuildIcon = '<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.75 1h4.19c.46 0 .9.18 1.22.5l2.34 2.34c.32.32.5.76.5 1.22v6.19A1.75 1.75 0 0 1 10.25 13h-6.5A1.75 1.75 0 0 1 2 11.25v-8.5A1.75 1.75 0 0 1 3.75 1zm0 1.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25V5.06a.25.25 0 0 0-.07-.18L8.09 2.57a.25.25 0 0 0-.18-.07H3.75z"></path></svg>';
  const markdownPreviewIcon = '<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3C4.37 3 1.4 5.17.2 8c1.2 2.83 4.17 5 7.8 5s6.6-2.17 7.8-5C14.6 5.17 11.63 3 8 3zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-1.5A2 2 0 1 0 8 6a2 2 0 0 0 0 4z"></path></svg>';
  const runMenuChevronIcon = '<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 5.4L8 10l4.6-4.6 1 1L8 12 2.4 6.4z"></path></svg>';
  const pinAllFromFileLabel = 'Pin All From File';
  const unpinAllLabel = 'Unpin All';
  const renderDropdownMenu = (
    summaryLabel: string,
    items: Array<{ action: string; label: string; title?: string; icon: string }>
  ): string => (
    `<details class="run-menu">`
    + `<summary class="btn subtle run-menu-summary">${escapeHtml(summaryLabel)}${runMenuChevronIcon}</summary>`
    + `<div class="run-menu-panel">`
    + items.map((item) => (
      `<button class="run-menu-item" data-action="${escapeAttribute(item.action)}" aria-label="${escapeAttribute(item.label)}" title="${escapeAttribute(item.title ?? item.label)}">`
      + `<span class="run-menu-item-icon">${item.icon}</span>`
      + `<span class="run-menu-item-label">${escapeHtml(item.label)}</span>`
      + `</button>`
    )).join('')
    + `</div>`
    + `</details>`
  );

  const statusControlHtml = state.mode === 'manuscript' && state.statusControl
    ? `<div class="status-editor">`
      + `<div class="status-options">`
      + state.statusControl.options.map((option) => {
        const checked = state.statusControl?.value === option ? ' checked' : '';
        return `<label class="status-option">`
          + `<input class="status-radio" type="radio" name="metadata-status" value="${escapeAttribute(option)}" data-action="setMetadataStatus"${checked} />`
          + `<span>${escapeHtml(option)}</span>`
          + `</label>`;
      }).join('')
      + `</div>`
      + `${state.statusControl.invalidValue
        ? `<div class="status-note warn">Unknown current status: <code>${escapeHtml(state.statusControl.invalidValue)}</code></div>`
        : !state.statusControl.value
          ? '<div class="status-note">No status set yet.</div>'
          : ''}`
      + `</div>`
    : '';
  const statusPanel = state.mode === 'manuscript' && statusControlHtml
    ? `<section class="panel title-panel">`
      + `<div class="panel-heading">`
      + `<div class="title-heading-block">`
      + `<h2>${escapeHtml(fileTitle.title)}</h2>`
      + `${state.structureSummary ? `<div class="title-structure">${escapeHtml(state.structureSummary)}</div>` : ''}`
      + `</div>`
      + `<div class="actions">`
      + renderDropdownMenu('Actions', [
        {
          action: 'runLocalValidate',
          label: 'Run Stage Check',
          title: runLocalChecksLabel,
          icon: runLocalChecksIcon
        },
        {
          action: 'openMarkdownPreview',
          label: 'Open Markdown Preview',
          title: 'Open Markdown Preview',
          icon: markdownPreviewIcon
        },
        {
          action: 'copyCleanManuscript',
          label: copyCleanManuscriptLabel,
          title: copyCleanManuscriptLabel,
          icon: copyCleanManuscriptIcon
        }
      ])
      + `</div>`
      + `</div>`
      + `${statusControlHtml}`
      + `</section>`
    : '';

  const navIcon = (pathData: string): string => (
    `<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true">`
    + `<path d="${pathData}"></path>`
    + `</svg>`
  );
  const backIcon = navIcon('M9.5 3L4.5 8l5 5 1.1-1.1L6.7 8l3.9-3.9z');
  const forwardIcon = navIcon('M6.5 3L5.4 4.1 9.3 8l-3.9 3.9L6.5 13l5-5z');
  const homeIcon = navIcon('M8 2l6 5v7h-4V9H6v5H2V7z');
  const collapsePanelIcon = navIcon('M3.4 5.4L8 10l4.6-4.6 1 1L8 12 2.4 6.4z');
  const expandPanelIcon = navIcon('M10.6 3.4L6 8l4.6 4.6-1 1L4 8l5.6-5.6z');

  const renderExplorerBreadcrumbs = (page: SidebarExplorerPage | undefined, collapsed: boolean): string => {
    if (!page || collapsed) {
      return '';
    }

    if (page.kind === 'home') {
      return `<div class="explorer-breadcrumbs"><span class="explorer-crumb-current">Home</span></div>`;
    }

    if (page.kind === 'category') {
      return `<div class="explorer-breadcrumbs">`
        + `<button class="explorer-crumb-link" data-action="explorerHome">Home</button>`
        + `<span class="explorer-crumb-separator">/</span>`
        + `<span class="explorer-crumb-current">${escapeHtml(page.category.label)}</span>`
        + `</div>`;
    }

    return `<div class="explorer-breadcrumbs">`
      + `<button class="explorer-crumb-link" data-action="explorerHome">Home</button>`
      + `<span class="explorer-crumb-separator">/</span>`
      + `${page.category
        ? `<button class="explorer-crumb-link" data-action="openExplorerCategory" data-key="${escapeAttribute(page.category.key)}" data-prefix="${escapeAttribute(page.category.prefix)}">${escapeHtml(page.category.label)}</button>`
          + `<span class="explorer-crumb-separator">/</span>`
        : ''}`
      + `<span class="explorer-crumb-current">${escapeHtml(page.entry.label)}</span>`
      + `</div>`;
  };

  const renderExplorerIdentifierBody = (
    page: SidebarExplorerIdentifierPage,
    options: { mode: 'active' | 'pinned'; filterValue: string; pinnedId?: string; cardActionHtml?: string }
  ): string => {
    const entry = page.entry;
    const showCanonicalId = entry.label.trim().toUpperCase() !== entry.id.trim().toUpperCase();
    const showSecondaryTitle = entry.title.trim().length > 0
      && entry.title.trim().toUpperCase() !== entry.id.trim().toUpperCase()
      && entry.title.trim().toLocaleUpperCase() !== entry.label.trim().toLocaleUpperCase();
    const toggleAction = options.mode === 'pinned' ? 'togglePinnedExplorerBacklinks' : 'toggleExplorerBacklinks';
    const filterAction = options.mode === 'pinned' ? 'setPinnedBacklinkFilter' : 'setBacklinkFilter';
    const showPinnedSummary = options.mode !== 'pinned';
    const panelId = options.pinnedId ? options.pinnedId.trim().toUpperCase() : '';
    const idAttribute = panelId ? ` data-id="${escapeAttribute(panelId)}"` : '';
    const filterInstance = options.mode === 'pinned' && panelId
      ? `pinned:${panelId}`
      : 'active';

    return `<article class="item metadata-item">`
      + `<div class="item-main">`
      + `${showPinnedSummary
        ? `<div class="item-title-row">`
          + `<span class="item-title-text">${escapeHtml(entry.label)}</span>`
          + `${!entry.known ? '<span class="badge warn">Missing</span>' : ''}`
          + `</div>`
        : (!entry.known ? `<div class="item-title-row"><span class="badge warn">Missing</span></div>` : '')}`
      + `${showPinnedSummary && showCanonicalId
        ? `<div class="item-subtext tiny">${escapeHtml(entry.id)}</div>`
        : ''}`
      + `${showPinnedSummary && showSecondaryTitle
        ? `<div class="item-subtext">${escapeHtml(entry.title)}</div>`
        : ''}`
      + `${showPinnedSummary && entry.description
        ? `<div class="metadata-value">${renderMarkdownForExplorer(entry.description, entry.sourceFilePath ?? state.documentPath)}</div>`
        : ''}`
      + `${entry.sourceFilePath && entry.sourceLine
        ? `<div class="explorer-source-row">`
          + `<span class="tiny-label">Source</span>`
          + `<button class="backlink-link" data-action="openBacklink" data-file-path="${escapeAttribute(entry.sourceFilePath)}" data-line="${entry.sourceLine}">${escapeHtml(entry.sourceFileLabel ?? entry.sourceFilePath)}:${entry.sourceLine}</button>`
          + `</div>`
        : ''}`
      + `${entry.sourceBody
        ? `<div class="explorer-body">${renderMarkdownForExplorer(entry.sourceBody, entry.sourceFilePath)}</div>`
        : ''}`
      + `<div class="backlink-section">`
      + `<div class="item-title-row">`
      + `<button class="btn subtle inline-toggle" data-action="${toggleAction}"${idAttribute}>${entry.backlinks.length} references${entry.backlinksExpanded ? ' (hide)' : ''}</button>`
      + `</div>`
      + `${entry.backlinksExpanded
        ? `<div class="filter-row filter-row-tight"><input class="filter-input" type="text" value="${escapeAttribute(options.filterValue)}" placeholder="Filter references by filename" data-backlink-instance="${escapeAttribute(filterInstance)}" data-backlink-action="${escapeAttribute(filterAction)}"${idAttribute} /></div>`
        : ''}`
      + `${entry.backlinksExpanded
        ? (entry.backlinks.length > 0
          ? entry.backlinks.map((backlink) => `<div class="backlink-row">`
            + `<button class="backlink-link" data-action="openBacklink" data-file-path="${escapeAttribute(backlink.filePath)}" data-line="${backlink.line}">${escapeHtml(backlink.fileLabel)}</button>`
            + `<span class="badge">${backlink.count}x</span>`
            + `<div class="item-subtext">${escapeHtml(backlink.excerpt)}</div>`
            + `</div>`).join('')
          : '<div class="empty tiny">No references found.</div>')
        : ''}`
      + `</div>`
      + `</div>`
      + `${options.cardActionHtml ? `<div class="item-actions explorer-card-actions">${options.cardActionHtml}</div>` : ''}`
      + `</article>`;
  };

  const renderExplorerBody = (
    page: SidebarExplorerPage | undefined,
    options: { mode: 'active' | 'pinned'; collapsed: boolean; filterValue: string; pinnedId?: string; cardActionHtml?: string }
  ): string => {
    if (!page) {
      return `<div class="empty">Click an identifier to inspect it here.</div>`;
    }

    if (options.collapsed) {
      return '';
    }

    if (page.kind === 'home') {
      const categoriesHtml = page.categories.length > 0
        ? `<div class="explorer-list">`
          + page.categories.map((category) => `<div class="explorer-list-row">`
            + `<button class="id-link" data-action="openExplorerCategory" data-key="${escapeAttribute(category.key)}" data-prefix="${escapeAttribute(category.prefix)}">${escapeHtml(category.label)}</button>`
            + `<span class="badge">${category.count}</span>`
            + `</div>`).join('')
          + `</div>`
        : '<div class="empty">No spine categories found in this project.</div>';
      const canAddCategory = options.mode === 'active';

      return `<article class="item metadata-item explorer-home-card">`
        + `<div class="item-main">`
        + `${categoriesHtml}`
        + `</div>`
        + `${canAddCategory
          ? `<div class="item-actions explorer-home-actions"><button class="btn subtle" data-action="addSpineCategory">+ New Category</button></div>`
          : ''}`
        + `</article>`;
    }

    if (page.kind === 'category') {
      return `<article class="item metadata-item">`
        + `<div class="item-main">`
        + `<div class="item-title-row"><span class="item-title-text">${escapeHtml(page.category.label)}</span><span class="badge">${page.items.length}</span></div>`
        + `${page.items.length > 0
          ? `<div class="explorer-list">`
            + page.items.map((item) => {
              const showCanonicalId = item.label.trim().toUpperCase() !== item.id.trim().toUpperCase();
              const showSecondaryTitle = item.title.trim().length > 0
                && item.title.trim().toUpperCase() !== item.id.trim().toUpperCase()
                && item.title.trim().toLocaleUpperCase() !== item.label.trim().toLocaleUpperCase();
              return `<div class="explorer-list-row">`
                + `<button class="id-link" data-action="openIdentifier" data-id="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</button>`
                + `${showCanonicalId ? `<span class="item-subtext tiny">${escapeHtml(item.id)}</span>` : ''}`
                + `${showSecondaryTitle ? `<span class="item-subtext">${escapeHtml(item.title)}</span>` : ''}`
                + `${!item.known ? '<span class="badge warn">Missing</span>' : ''}`
                + `${item.description ? `<div class="item-subtext">${escapeHtml(item.description)}</div>` : ''}`
                + `</div>`;
            }).join('')
            + `</div>`
          : '<div class="empty tiny">No spine entries found for this category.</div>'}`
        + `</div>`
        + `</article>`;
    }

    return renderExplorerIdentifierBody(page, options);
  };

  const pinnedIdentifiers = new Set(state.pinnedExplorers.map((panel) => panel.id.trim().toUpperCase()));
  const activeIdentifierId = state.explorer?.kind === 'identifier'
    ? state.explorer.entry.id.trim().toUpperCase()
    : '';
  const showPinButton = !!activeIdentifierId && !pinnedIdentifiers.has(activeIdentifierId);
  const pinButtonHtml = showPinButton
    ? `<button class="btn subtle explorer-pin-btn" data-action="pinExplorerEntry">Pin</button>`
    : '';

  const activeExplorerNav = `<div class="explorer-nav">`
    + `<button class="btn subtle btn-icon" data-action="explorerBack"${state.explorerCanGoBack ? '' : ' disabled'} aria-label="Back" title="Back">${backIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="explorerForward"${state.explorerCanGoForward ? '' : ' disabled'} aria-label="Forward" title="Forward">${forwardIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="explorerHome"${state.explorerCanGoHome ? '' : ' disabled'} aria-label="Home" title="Home">${homeIcon}</button>`
    + `</div>`;

  const activeExplorerPanel = `<section class="panel explorer-panel">`
    + `<div class="panel-heading">`
    + `<h2>Spine</h2>`
    + `${activeExplorerNav}`
    + `</div>`
    + `${renderExplorerBreadcrumbs(state.explorer, false)}`
    + `${renderExplorerBody(state.explorer, { mode: 'active', collapsed: false, filterValue: state.backlinkFilter, cardActionHtml: pinButtonHtml })}`
    + `</section>`;

  const renderPinnedExplorerPanel = (panel: SidebarPinnedExplorerPanel): string => {
    const unpinLabel = `Unpin ${panel.page.entry.label}`;
    const collapseLabel = panel.collapsed ? 'Expand pinned panel' : 'Collapse pinned panel';
    return `<section class="panel explorer-panel explorer-panel-pinned${panel.collapsed ? ' collapsed' : ''}" data-pinned-id="${escapeAttribute(panel.id)}">`
      + `<div class="panel-heading">`
      + `<h2>${escapeHtml(panel.page.entry.label)}</h2>`
      + `<div class="explorer-nav explorer-nav-pinned">`
      + `<span class="panel-kind-badge">Pinned</span>`
      + `<button class="btn subtle btn-icon" data-action="togglePinnedExplorerCollapse" data-id="${escapeAttribute(panel.id)}" aria-label="${escapeAttribute(collapseLabel)}" title="${escapeAttribute(collapseLabel)}">${panel.collapsed ? expandPanelIcon : collapsePanelIcon}</button>`
      + `<button class="btn subtle btn-icon explorer-unpin-btn" data-action="unpinExplorerEntry" data-id="${escapeAttribute(panel.id)}" aria-label="${escapeAttribute(unpinLabel)}" title="${escapeAttribute(unpinLabel)}">×</button>`
      + `</div>`
      + `</div>`
      + `${renderExplorerBody(panel.page, { mode: 'pinned', collapsed: panel.collapsed, filterValue: panel.backlinkFilter, pinnedId: panel.id })}`
      + `</section>`;
  };

  const explorerPanelsHtml = state.showExplorer
    ? `<div class="spine-panel-stack">`
      + `${state.pinnedExplorers.map((panel) => renderPinnedExplorerPanel(panel)).join('')}`
      + `${activeExplorerPanel}`
      + `</div>`
    : '<div class="empty-panel">No spine categories found in this project.</div>';

  const tocHtml = state.tocEntries.length > 0
    ? state.tocEntries.map((entry) => {
      const shouldOpenSpineBrowser = state.isSpineCategoryFile && !!entry.identifier;
      const headingLink = shouldOpenSpineBrowser
        ? `<button class="toc-link lvl-${entry.level}" data-action="openIdentifier" data-id="${escapeAttribute(entry.identifier!.id)}">${escapeHtml(entry.heading)}</button>`
        : `<button class="toc-link lvl-${entry.level}" data-action="openTocHeading" data-line="${entry.line}">${escapeHtml(entry.heading)}</button>`;
      const backlinkSection = entry.identifier
        ? `<div class="backlink-section">`
          + `<div class="item-title-row">`
          + `<button class="btn subtle inline-toggle" data-action="toggleTocBacklinks" data-id="${escapeAttribute(entry.identifier.id)}">${entry.backlinkCount} references${entry.backlinksExpanded ? ' (hide)' : ''}</button>`
          + `</div>`
          + `${entry.backlinksExpanded
            ? (entry.backlinks.length > 0
              ? entry.backlinks.map((backlink) => `<div class="backlink-row">`
                + `<button class="backlink-link" data-action="openBacklink" data-file-path="${escapeAttribute(backlink.filePath)}" data-line="${backlink.line}">${escapeHtml(backlink.fileLabel)}</button>`
                + `<span class="badge">${backlink.count}x</span>`
                + `<div class="item-subtext">${escapeHtml(backlink.excerpt)}</div>`
                + `</div>`).join('')
              : '<div class="empty tiny">No matches for this identifier.</div>')
            : ''}`
          + `</div>`
        : '';

      return `<article class="toc-item">${headingLink}${backlinkSection}</article>`;
    }).join('')
    : '<div class="empty">No headings found (H1-H3).</div>';

  const tocPanel = state.showToc
    ? `<section class="panel">`
      + `<div class="panel-heading">`
      + `<h2>${state.isSpineCategoryFile ? 'Spine Entries' : 'Table Of Contents'}</h2>`
      + `</div>`
      + `${state.isSpineCategoryFile
        ? `<div class="filter-row"><input class="filter-input" type="text" value="${escapeAttribute(state.backlinkFilter)}" placeholder="Filter references by filename" data-backlink-instance="active" data-backlink-action="setBacklinkFilter" /></div>`
        : ''}`
      + `<div class="toc-list">${tocHtml}</div>`
      + `</section>`
    : '';

  const metadataPanel = state.mode === 'manuscript'
    ? `<section class="panel metadata-panel${state.metadataCollapsed ? ' collapsed' : ''}">`
      + `<div class="panel-heading">`
      + `<h2>Metadata</h2>`
      + `<div class="explorer-nav">`
      + `${state.metadataCollapsed
        ? ''
        : `<button class="btn subtle" data-action="toggleMetadataEditing">${state.metadataEditing ? 'Done' : 'Edit'}</button>`}`
      + `<button class="btn subtle btn-icon" data-action="toggleMetadataCollapse" aria-label="${state.metadataCollapsed ? 'Expand' : 'Collapse'}" title="${state.metadataCollapsed ? 'Expand' : 'Collapse'}">${state.metadataCollapsed ? expandPanelIcon : collapsePanelIcon}</button>`
      + `</div>`
      + `</div>`
      + `${state.metadataCollapsed
        ? ''
        : `${showMetadataEditingControls ? '<div class="actions"><button class="btn primary" data-action="addMetadataField">Add Field</button></div>' : ''}`
          + `<div class="list">${metadataHtml}</div>`}`
      + `</section>`
    : '';

  const commentErrors = state.comments.parseErrors.length > 0
    ? `<div class="error-panel">${state.comments.parseErrors.map((error) => escapeHtml(error)).join('<br/>')}</div>`
    : '';

  const commentsList = state.comments.items.length > 0
    ? state.comments.items.map((item) => (
      `<article class="item metadata-item comment-list-item${item.status === 'resolved' ? ' resolved' : ''}${item.isSelected ? ' selected' : ''}${item.threadPosition ? ` thread-${item.threadPosition}` : ''}" data-id="${escapeAttribute(item.id)}" data-action="openCommentThread">`
      + `<div class="item-main">`
      + `<div class="item-title-row">`
      + `<span class="comment-message">${escapeHtml(item.message)}</span>`
      + `<span class="badge${item.status === 'resolved' ? '' : ' warn'}">${item.status === 'resolved' ? 'Resolved' : 'Unresolved'}</span>`
      + `${item.degraded ? '<span class="badge warn">Moved</span>' : ''}`
      + `</div>`
      + `${item.threadPosition && item.threadPosition !== 'first'
        ? ''
        : `<div class="item-subtext comment-anchor-excerpt">&quot;${escapeHtml(item.excerpt.length > 100 ? item.excerpt.slice(0, 100) + '…' : item.excerpt)}&quot;</div>`}`
      + `<div class="item-subtext tiny">`
      + `${item.author ? `${escapeHtml(item.author)}` : ''}`
      + `${item.created ? ` • ${escapeHtml(dayjs(item.created).fromNow())}` : ''}`
      + `</div>`
      + `</div>`
      + `<div class="item-actions comment-actions">`
      + `<button class="btn subtle inline-toggle comment-jump-btn" data-action="jumpToComment" data-id="${escapeAttribute(item.id)}" aria-label="Jump to line ${item.line}" title="Jump to line ${item.line}">${navIcon('M5.928 7.976l4.357-4.357-.618-.62L5 7.672v.618l4.667 4.632.618-.614L5.928 7.976z')} Line ${item.line}</button>`
      + `<span class="comment-actions-spacer"></span>`
      + `${item.threadPosition && item.threadPosition !== 'first'
        ? ''
        : `<button class="btn subtle inline-toggle" data-action="toggleCommentResolved" data-id="${escapeAttribute(item.id)}"${item.threadPosition === 'first' ? ' data-resolve-thread="true"' : ''}>${item.status === 'resolved' ? (item.threadPosition === 'first' ? 'Unresolve Thread' : 'Unresolve') : (item.threadPosition === 'first' ? 'Resolve Thread' : 'Resolve')}</button>`}`
      + `<button class="btn subtle inline-toggle" data-action="replyComment" data-id="${escapeAttribute(item.id)}">Reply</button>`
      + `${item.author && state.comments.currentAuthor && item.author.toLowerCase() === state.comments.currentAuthor.toLowerCase()
        ? `<button class="btn danger inline-toggle" data-action="deleteComment" data-id="${escapeAttribute(item.id)}">Delete</button>`
        : ''}`
      + `</div>`
      + `</article>`
    )).join('')
    : '<div class="empty">No comments yet. To add one at the cursor location, run "Stego: Add Comment" from the Command Palette.</div>';

  const commentsPanel = `<section class="panel comments-panel">`
    + `<div class="panel-heading">`
    + `<h2>Comments</h2>`
    + `<div class="actions">`
    + `<button class="btn subtle inline-toggle" data-action="clearResolvedComments">Clear Resolved</button>`
    + `</div>`
    + `</div>`
    + `<div class="item-subtext comments-summary">${state.comments.totalCount} total • ${state.comments.unresolvedCount} unresolved</div>`
    + `${commentErrors}`
    + `${commentsList}`
    + `</section>`;

  const overviewPanel = state.overview
    ? `<section class="panel title-panel">`
      + `<div class="panel-heading">`
      + `<div class="title-heading-block">`
      + `<h2>${escapeHtml(state.overview.manuscriptTitle)}</h2>`
      + `<div class="title-structure">Last updated ${escapeHtml(dayjs(state.overview.generatedAt).fromNow())}</div>`
      + `</div>`
      + `<div class="actions">`
      + renderDropdownMenu('Actions', [
        {
          action: 'runBuildWorkflow',
          label: 'Compile Full Manuscript',
          title: runBuildLabel,
          icon: runBuildIcon
        },
        {
          action: 'runGateStageWorkflow',
          label: 'Run Stage Check',
          title: runStageLabel,
          icon: runLocalChecksIcon
        }
      ])
      + `</div>`
      + `</div>`
      + `<div class="overview-stage">`
      + `<div class="overview-stage-list">`
      + `<div class="overview-gate-item">`
      + `<div class="overview-stage-row"><span>Stage Check Result</span><div class="overview-status-actions"><span class="badge ${gateStateBadgeClass(state.overview.gateSnapshot.stageCheck.state)}">${escapeHtml(gateStateLabel(state.overview.gateSnapshot.stageCheck.state))}</span></div></div>`
      + `${state.overview.gateSnapshot.stageCheck.stage ? `<div class="item-subtext tiny">Stage: ${escapeHtml(state.overview.gateSnapshot.stageCheck.stage)}</div>` : ''}`
      + `${state.overview.gateSnapshot.stageCheck.updatedAt ? `<div class="item-subtext tiny">${escapeHtml(dayjs(state.overview.gateSnapshot.stageCheck.updatedAt).fromNow())}</div>` : ''}`
      + `${state.overview.gateSnapshot.stageCheck.detail && (state.overview.gateSnapshot.stageCheck.detailKind === 'warning' || state.overview.gateSnapshot.stageCheck.detailKind === 'error')
        ? `<div class="status-note ${state.overview.gateSnapshot.stageCheck.detailKind === 'error' ? 'error' : 'warn'} overview-gate-error">${escapeHtml(state.overview.gateSnapshot.stageCheck.detail)}</div>`
        : ''}`
      + `</div>`
      + `<div class="overview-gate-item">`
      + `<div class="overview-stage-row"><span>Compile Result</span><div class="overview-status-actions"><span class="badge ${gateStateBadgeClass(state.overview.gateSnapshot.build.state)}">${escapeHtml(gateStateLabel(state.overview.gateSnapshot.build.state))}</span></div></div>`
      + `${state.overview.gateSnapshot.build.detail && state.overview.gateSnapshot.build.detailKind === 'output' ? `<div class="item-subtext tiny">Output: ${escapeHtml(state.overview.gateSnapshot.build.detail)}</div>` : ''}`
      + `${state.overview.gateSnapshot.build.updatedAt ? `<div class="item-subtext tiny">${escapeHtml(dayjs(state.overview.gateSnapshot.build.updatedAt).fromNow())}</div>` : ''}`
      + `${state.overview.gateSnapshot.build.detail && (state.overview.gateSnapshot.build.detailKind === 'warning' || state.overview.gateSnapshot.build.detailKind === 'error')
        ? `<div class="status-note ${state.overview.gateSnapshot.build.detailKind === 'error' ? 'error' : 'warn'} overview-gate-error">${escapeHtml(state.overview.gateSnapshot.build.detail)}</div>`
        : ''}`
      + `</div>`
      + `</div>`
      + `</div>`
      + `<div class="overview-metrics">`
      + `<div class="overview-metric-row">`
      + `<article class="item metadata-item overview-metric-card neutral"><div class="item-main"><div class="item-title-row"><span class="item-title-text">Word Count</span></div><div class="metadata-value">${state.overview.wordCount.toLocaleString()}</div></div></article>`
      + `<article class="item metadata-item overview-metric-card neutral"><div class="item-main"><div class="item-title-row"><span class="item-title-text">Manuscript Files</span></div><div class="metadata-value">${state.overview.manuscriptFileCount.toLocaleString()}</div></div></article>`
      + `</div>`
      + `<div class="overview-metric-row">`
      + `<article class="item metadata-item overview-metric-card ${state.overview.missingRequiredMetadataCount === 0 ? 'ok' : 'error'}">`
      + `<div class="item-main"><div class="item-title-row"><span class="item-title-text">Missing Required Metadata</span></div><div class="metadata-value">${state.overview.missingRequiredMetadataCount.toLocaleString()}</div></div>`
      + `<div class="metric-card-actions"><button class="btn subtle btn-icon metric-card-action" data-action="openFirstMissingMetadata" data-file-path="${escapeAttribute(state.overview.firstMissingMetadata?.filePath ?? '')}" aria-label="${escapeAttribute(openMetricTargetLabel)}" title="${escapeAttribute(openMetricTargetLabel)}"${state.overview.firstMissingMetadata ? '' : ' disabled'}>${openMetricTargetIcon}</button></div>`
      + `</article>`
      + `<article class="item metadata-item overview-metric-card ${state.overview.unresolvedCommentsCount === 0 ? 'ok' : 'warn'}">`
      + `<div class="item-main"><div class="item-title-row"><span class="item-title-text">Unresolved Comments</span></div><div class="metadata-value">${state.overview.unresolvedCommentsCount.toLocaleString()}</div></div>`
      + `<div class="metric-card-actions"><button class="btn subtle btn-icon metric-card-action" data-action="openFirstUnresolvedComment" data-file-path="${escapeAttribute(state.overview.firstUnresolvedComment?.filePath ?? '')}" data-id="${escapeAttribute(state.overview.firstUnresolvedComment?.commentId ?? '')}" aria-label="${escapeAttribute(openMetricTargetLabel)}" title="${escapeAttribute(openMetricTargetLabel)}"${state.overview.firstUnresolvedComment ? '' : ' disabled'}>${openMetricTargetIcon}</button></div>`
      + `</article>`
      + `</div>`
      + `</div>`
      + `<div class="overview-structure">`
      + `${state.overview.mapRows.length > 0
        ? `<div class="overview-file-list">${state.overview.mapRows.map((row) => row.kind === 'group'
          ? `<div class="overview-group-row lvl-${row.level}">${escapeHtml(row.label)}</div>`
          : `<article class="item metadata-item overview-file-item">`
            + `<div class="item-main">`
            + `<div class="item-title-row">`
            + `<button class="backlink-link" data-action="openOverviewFile" data-file-path="${escapeAttribute(row.filePath)}">${escapeHtml(row.fileLabel)}</button>`
            + `<span class="badge">${escapeHtml(row.status)}</span>`
            + `</div>`
            + `</div>`
            + `</article>`).join('')}</div>`
        : '<div class="empty tiny">No manuscript files found.</div>'}`
      + `</div>`
      + `</section>`
    : '';

  const showSpineTabActions = state.activeTab === 'spine' && state.showExplorer && state.hasActiveMarkdown;
  const spineTabActions = showSpineTabActions
    ? `<div class="sidebar-tabs-actions">`
      + `<button class="btn subtle" data-action="pinAllExplorerEntriesFromFile"${state.canPinAllFromFile ? '' : ' disabled'}>${pinAllFromFileLabel}</button>`
      + `${state.pinnedExplorers.length > 0
        ? `<button class="btn subtle" data-action="unpinAllExplorerEntries">${unpinAllLabel}</button>`
        : ''}`
      + `</div>`
    : '';
  const spineTabActionsRow = spineTabActions
    ? `<div class="spine-tab-actions-row">${spineTabActions}</div>`
    : '';

  const tabRow = `<div class="sidebar-tabs">`
    + `<div class="sidebar-tabs-main">`
    + `${showDocumentTab
      ? `<button class="sidebar-tab${state.activeTab === 'document' ? ' active' : ''}" data-action="setSidebarTab" data-value="document">Document</button>`
      : ''}`
    + `${state.showExplorer
      ? `<button class="sidebar-tab${state.activeTab === 'spine' ? ' active' : ''}" data-action="setSidebarTab" data-value="spine">Spine</button>`
      : ''}`
    + `${state.canShowOverview
      ? `<button class="sidebar-tab${state.activeTab === 'overview' ? ' active' : ''}" data-action="setSidebarTab" data-value="overview">Manuscript</button>`
      : ''}`
    + `</div>`
    + `<div class="sidebar-tabs-nav">`
    + `<button class="btn subtle btn-icon" data-action="globalBack"${state.globalCanGoBack ? '' : ' disabled'} aria-label="Back" title="Back">${backIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="globalForward"${state.globalCanGoForward ? '' : ' disabled'} aria-label="Forward" title="Forward">${forwardIcon}</button>`
    + `</div>`
    + `</div>`;

  const warningsHtml = state.warnings.length > 0
    ? `<div class="warning-panel">${state.warnings.map((warning) => escapeHtml(warning)).join('<br/>')}</div>`
    : '';
  const detachedDocumentBanner = state.documentTabDetached && state.documentPath
    ? `<div class="detached-document-banner">`
      + `<span class="detached-document-arrow" aria-hidden="true">${backIcon}</span>`
      + `<button class="backlink-link detached-document-link" data-action="openOverviewFile" data-file-path="${escapeAttribute(state.documentPath)}">${escapeHtml(fileTitle.filename || state.documentPath)}</button>`
      + `</div>`
    : '';

  const documentContent = `
      ${warningsHtml}
      ${detachedDocumentBanner}
      ${statusPanel}
      ${state.parseError ? `<div class="error-panel">Frontmatter parse error: ${escapeHtml(state.parseError)}</div>` : ''}
      ${state.mode === 'manuscript' ? metadataPanel : tocPanel}
      ${state.mode === 'manuscript' ? tocPanel : ''}
      ${state.enableComments ? commentsPanel : ''}
    `;

  const spineContent = `
      ${tabRow}
      ${spineTabActionsRow}
      ${warningsHtml}
      ${explorerPanelsHtml}
    `;

  const content = state.activeTab === 'overview' && state.overview
    ? `
      ${tabRow}
      ${warningsHtml}
      ${overviewPanel}
    `
    : state.activeTab === 'spine'
      ? spineContent
    : state.documentTabDetached
      ? `
      ${tabRow}
      ${documentContent}
    `
    : !state.hasActiveMarkdown
      ? state.canShowOverview
        ? `
          ${tabRow}
          <div class="empty-panel">Overview is available for this project.</div>
        `
        : '<div class="empty-panel">Open a Markdown document to use the Stego sidebar.</div>'
      : `
      ${tabRow}
      ${documentContent}
    `;

  const assets = getSidebarAssetUris(webview, extensionUri);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${assets.styleUri.toString()}" />
</head>
<body data-explorer-load-token="${state.explorerLoadToken}" data-identifier-pattern="${escapeAttribute(DEFAULT_IDENTIFIER_PATTERN)}" data-active-tab="${escapeAttribute(state.activeTab)}" data-selected-comment-id="${escapeAttribute(state.comments.selectedId ?? '')}">
  ${content}
  <script nonce="${nonce}" src="${assets.scriptUri.toString()}"></script>
</body>
</html>`;
}
