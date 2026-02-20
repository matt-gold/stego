import * as vscode from 'vscode';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../../shared/constants';
import type { SidebarIdentifierLink, SidebarState } from '../../../shared/types';
import { getSidebarFileTitle } from '../sidebarToc';
import { getSidebarAssetUris } from './sidebarAssetUris';
import { renderMarkdownForExplorer } from './renderMarkdownForExplorer';
import { escapeAttribute, escapeHtml, randomNonce } from './renderUtils';

export function renderSidebarHtml(webview: vscode.Webview, state: SidebarState, extensionUri: vscode.Uri): string {
  const nonce = randomNonce();
  const fileTitle = getSidebarFileTitle(state.documentPath);
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
          + `<div class="item-title-row"><code>${escapeHtml(entry.key)}</code>${entry.isBibleCategory ? '<span class="badge bible">Story Bible</span>' : ''}<span class="badge">${entry.arrayItems.length} items</span></div>`
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
        + `<div class="item-title-row"><code>${escapeHtml(entry.key)}</code>${entry.isBibleCategory ? '<span class="badge bible">Story Bible</span>' : ''}</div>`
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

  const activeStageLabel = state.statusControl?.value ?? state.statusControl?.invalidValue;
  const runLocalChecksLabel = activeStageLabel
    ? `Run ${activeStageLabel} checks`
    : 'Run stage checks';

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
      + `<div class="status-actions"><button class="btn subtle inline-toggle" data-action="runLocalValidate">${escapeHtml(runLocalChecksLabel)}</button></div>`
      + `${state.statusControl.invalidValue
        ? `<div class="status-note warn">Unknown current status: <code>${escapeHtml(state.statusControl.invalidValue)}</code></div>`
        : !state.statusControl.value
          ? '<div class="status-note">No status set yet.</div>'
          : ''}`
      + `</div>`
    : '';
  const statusPanel = state.mode === 'manuscript' && statusControlHtml
    ? `<section class="panel">`
      + `<h2>Status</h2>`
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
  const previewIcon = navIcon('M13.5 1H4.5C3.122 1 2 2.122 2 3.5V6.276C2.319 6.162 2.653 6.089 3 6.05V3.499C3 2.672 3.673 1.999 4.5 1.999H8.5V13.385L9.557 14.442C9.714 14.591 9.831 14.786 9.907 14.999H13.5C14.878 14.999 16 13.877 16 12.499V3.5C16 2.122 14.878 1 13.5 1ZM15 12.5C15 13.327 14.327 14 13.5 14H9.5V2H13.5C14.327 2 15 2.673 15 3.5V12.5ZM6.29 12.59C6.74 12.01 7 11.28 7 10.5C7 8.57 5.43 7 3.5 7C1.57 7 0 8.57 0 10.5C0 12.43 1.57 14 3.5 14C4.28 14 5.01 13.74 5.59 13.29L8.15 15.85C8.24 15.95 8.37 16 8.5 16C8.63 16 8.76 15.95 8.85 15.85C9.05 15.66 9.05 15.34 8.85 15.15L6.29 12.59ZM5.5 12C5.36 12.19 5.19 12.36 5 12.5C4.59 12.81 4.06 13 3.5 13C2.12 13 1 11.88 1 10.5C1 9.12 2.12 8 3.5 8C4.88 8 6 9.12 6 10.5C6 11.06 5.81 11.59 5.5 12Z');
  const collapsePanelIcon = navIcon('M3.4 5.4L8 10l4.6-4.6 1 1L8 12 2.4 6.4z');
  const expandPanelIcon = navIcon('M10.6 3.4L6 8l4.6 4.6-1 1L4 8l5.6-5.6z');

  const explorerNav = `<div class="explorer-nav">`
    + `<button class="btn subtle btn-icon" data-action="explorerBack"${state.explorerCanGoBack ? '' : ' disabled'} aria-label="Back" title="Back">${backIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="explorerForward"${state.explorerCanGoForward ? '' : ' disabled'} aria-label="Forward" title="Forward">${forwardIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="explorerHome"${state.explorerCanGoHome ? '' : ' disabled'} aria-label="Home" title="Home">${homeIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="toggleExplorerCollapse" aria-label="${state.explorerCollapsed ? 'Expand' : 'Collapse'}" title="${state.explorerCollapsed ? 'Expand' : 'Collapse'}">${state.explorerCollapsed ? expandPanelIcon : collapsePanelIcon}</button>`
    + `</div>`;

  const explorerBreadcrumbs = !state.explorer || state.explorerCollapsed
    ? ''
    : state.explorer.kind === 'home'
      ? `<div class="explorer-breadcrumbs"><span class="explorer-crumb-current">Home</span></div>`
      : state.explorer.kind === 'category'
        ? `<div class="explorer-breadcrumbs">`
          + `<button class="explorer-crumb-link" data-action="explorerHome">Home</button>`
          + `<span class="explorer-crumb-separator">/</span>`
          + `<span class="explorer-crumb-current">${escapeHtml(state.explorer.category.label)}</span>`
          + `</div>`
        : `<div class="explorer-breadcrumbs">`
          + `<button class="explorer-crumb-link" data-action="explorerHome">Home</button>`
          + `<span class="explorer-crumb-separator">/</span>`
          + `${state.explorer.category
            ? `<button class="explorer-crumb-link" data-action="openExplorerCategory" data-key="${escapeAttribute(state.explorer.category.key)}" data-prefix="${escapeAttribute(state.explorer.category.prefix)}">${escapeHtml(state.explorer.category.label)}</button>`
              + `<span class="explorer-crumb-separator">/</span>`
            : ''}`
          + `<span class="explorer-crumb-current">${escapeHtml(state.explorer.entry.id)}</span>`
          + `</div>`;

  const explorerBody = !state.explorer
    ? `<div class="empty">Click an identifier to inspect it here.</div>`
    : state.explorerCollapsed
      ? ''
      : state.explorer.kind === 'home'
        ? (state.explorer.categories.length > 0
          ? `<div class="explorer-list">`
            + state.explorer.categories.map((category) => `<div class="explorer-list-row">`
              + `<button class="id-link" data-action="openExplorerCategory" data-key="${escapeAttribute(category.key)}" data-prefix="${escapeAttribute(category.prefix)}">${escapeHtml(category.label)}</button>`
              + `<span class="badge">${category.count}</span>`
              + `</div>`).join('')
            + `</div>`
          : '<div class="empty">No bible categories found in this project.</div>')
        : state.explorer.kind === 'category'
          ? `<article class="item metadata-item">`
            + `<div class="item-main">`
            + `<div class="item-title-row"><span class="item-title-text">${escapeHtml(state.explorer.category.label)}</span><span class="badge">${state.explorer.items.length}</span></div>`
            + `${state.explorer.items.length > 0
              ? `<div class="explorer-list">`
                + state.explorer.items.map((item) => `<div class="explorer-list-row">`
                  + `<button class="id-link" data-action="openIdentifier" data-id="${escapeAttribute(item.id)}">${escapeHtml(item.id)}</button>`
                  + `${item.title.trim().toUpperCase() !== item.id.toUpperCase() ? `<span class="item-subtext">${escapeHtml(item.title)}</span>` : ''}`
                  + `${!item.known ? '<span class="badge warn">Missing</span>' : ''}`
                  + `${item.description ? `<div class="item-subtext">${escapeHtml(item.description)}</div>` : ''}`
                  + `</div>`).join('')
                + `</div>`
              : '<div class="empty tiny">No identifiers found for this category.</div>'}`
            + `</div>`
            + `</article>`
          : (() => {
            const entry = state.explorer.entry;
            return `<article class="item metadata-item">`
              + `<div class="item-main">`
              + `<div class="item-title-row">`
              + `<span class="item-title-text">${escapeHtml(entry.title)}</span>`
              + `${!entry.known ? '<span class="badge warn">Missing</span>' : ''}`
              + `</div>`
              + `${entry.description
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
              + `<button class="btn subtle inline-toggle" data-action="toggleExplorerBacklinks">${entry.backlinks.length} references${entry.backlinksExpanded ? ' (hide)' : ''}</button>`
              + `</div>`
              + `${entry.backlinksExpanded
                ? `<div class="filter-row filter-row-tight"><input id="backlink-filter" class="filter-input" type="text" value="${escapeAttribute(state.backlinkFilter)}" placeholder="Filter references by filename" /></div>`
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
              + `</article>`;
          })();

  const explorerHtml = `<section class="panel explorer-panel${state.explorerCollapsed ? ' collapsed' : ''}">`
    + `<div class="panel-heading">`
    + `<h2>Bible Browser</h2>`
    + `${explorerNav}`
    + `</div>`
    + `${explorerBreadcrumbs}`
    + `${explorerBody}`
    + `</section>`;

  const tocHtml = state.tocEntries.length > 0
    ? state.tocEntries.map((entry) => {
      const headingLink = `<button class="toc-link lvl-${entry.level}" data-action="openTocHeading" data-line="${entry.line}">${escapeHtml(entry.heading)}</button>`;
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
      + `<h2>Table Of Contents</h2>`
      + `${state.mode
        ? `<span class="panel-kind-badge">${
          state.mode === 'manuscript'
            ? 'Manuscript'
            : state.isBibleCategoryFile
              ? 'Bible Entry'
              : 'Note'
        }</span>`
        : ''}`
      + `</div>`
      + `${state.isBibleCategoryFile && (!state.explorer || state.explorer.kind !== 'identifier' || state.explorerCollapsed)
        ? `<div class="filter-row"><input id="backlink-filter" class="filter-input" type="text" value="${escapeAttribute(state.backlinkFilter)}" placeholder="Filter references by filename" /></div>`
        : ''}`
      + `<div class="toc-list">${tocHtml}</div>`
      + `</section>`
    : '';

  const metadataPanel = state.mode === 'manuscript'
    ? `<section class="panel">`
      + `<div class="panel-heading">`
      + `<h2>Metadata</h2>`
      + `<button class="btn subtle" data-action="toggleMetadataEditing">${state.metadataEditing ? 'Done' : 'Edit'}</button>`
      + `</div>`
      + `${showMetadataEditingControls ? '<div class="actions"><button class="btn primary" data-action="addMetadataField">Add Field</button></div>' : ''}`
      + `<div class="list">${metadataHtml}</div>`
      + `</section>`
    : '';

  const utilityPanel = state.mode === 'manuscript'
    ? ''
    : `<section class="panel">`
      + `<h2>Actions</h2>`
      + `<div class="actions"><button class="btn subtle" data-action="refresh">Refresh</button></div>`
      + `</section>`;

  const commentErrors = state.comments.parseErrors.length > 0
    ? `<div class="error-panel">${state.comments.parseErrors.map((error) => escapeHtml(error)).join('<br/>')}</div>`
    : '';

  const commentsList = state.comments.items.length > 0
    ? state.comments.items.map((item) => (
      `<article class="item metadata-item comment-list-item${item.status === 'resolved' ? ' resolved' : ''}${item.isSelected ? ' selected' : ''}">`
      + `<div class="item-main">`
      + `<div class="item-title-row">`
      + `<button class="id-link" data-action="openCommentThread" data-id="${escapeAttribute(item.id)}">${escapeHtml(item.id)}</button>`
      + `<span class="badge${item.status === 'resolved' ? '' : ' warn'}">${item.status === 'resolved' ? 'Resolved' : 'Open'}</span>`
      + `${item.degraded ? '<span class="badge warn">Moved</span>' : ''}`
      + `</div>`
      + `<div class="item-subtext">${escapeHtml(item.excerpt)}</div>`
      + `<div class="item-subtext">${escapeHtml(item.message)}</div>`
      + `<div class="item-subtext tiny">`
      + `line ${item.line}`
      + `${item.author ? ` • ${escapeHtml(item.author)}` : ''}`
      + `${item.created ? ` • ${escapeHtml(item.created)}` : ''}`
      + `</div>`
      + `</div>`
      + `<div class="item-actions">`
      + `<button class="btn subtle inline-toggle" data-action="jumpToComment" data-id="${escapeAttribute(item.id)}">Jump</button>`
      + `<button class="btn subtle inline-toggle" data-action="replyComment" data-id="${escapeAttribute(item.id)}">Reply</button>`
      + `<button class="btn subtle inline-toggle" data-action="toggleCommentResolved" data-id="${escapeAttribute(item.id)}">${item.status === 'resolved' ? 'Reopen' : 'Resolve'}</button>`
      + `</div>`
      + `</article>`
    )).join('')
    : '<div class="empty">No comments yet. Add one from the current cursor location.</div>';

  const commentsPanel = `<section class="panel comments-panel">`
    + `<div class="panel-heading">`
    + `<h2>Comments</h2>`
    + `<div class="actions">`
    + `<button class="btn subtle inline-toggle" data-action="addComment">Add Comment</button>`
    + `<button class="btn subtle inline-toggle" data-action="clearResolvedComments">Clear Resolved</button>`
    + `</div>`
    + `</div>`
    + `<div class="item-subtext comments-summary">${state.comments.totalCount} total • ${state.comments.openCount} open</div>`
    + `${commentErrors}`
    + `${commentsList}`
    + `</section>`;

  const tabRow = `<div class="sidebar-tabs">`
    + `<button class="sidebar-tab${state.activeTab === 'document' ? ' active' : ''}" data-action="setSidebarTab" data-value="document">Document</button>`
    + `<button class="sidebar-tab${state.activeTab === 'comments' ? ' active' : ''}" data-action="setSidebarTab" data-value="comments">Comments <span class="badge">${state.comments.totalCount}</span></button>`
    + `</div>`;

  const documentContent = `
      ${state.parseError ? `<div class="error-panel">Frontmatter parse error: ${escapeHtml(state.parseError)}</div>` : ''}
      ${statusPanel}
      ${state.showExplorer ? explorerHtml : ''}
      ${state.mode === 'manuscript' ? metadataPanel : tocPanel}
      ${state.mode === 'manuscript' ? tocPanel : ''}
      ${utilityPanel}
    `;

  const content = !state.hasActiveMarkdown
    ? '<div class="empty-panel">Open a Markdown document to use the Stego sidebar.</div>'
    : `
      <div class="file-title-row">
        <div class="file-title" title="${escapeAttribute(fileTitle.filename)}">${escapeHtml(fileTitle.title)}</div>
        <button class="btn subtle btn-icon file-preview-btn" data-action="openMarkdownPreview" aria-label="Open Markdown Preview" title="Open Markdown Preview">${previewIcon}</button>
      </div>
      ${tabRow}
      ${state.activeTab === 'comments' ? commentsPanel : documentContent}
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
<body data-explorer-load-token="${state.explorerLoadToken}" data-identifier-pattern="${escapeAttribute(DEFAULT_IDENTIFIER_PATTERN)}">
  ${content}
  <script nonce="${nonce}" src="${assets.scriptUri.toString()}"></script>
</body>
</html>`;
}
