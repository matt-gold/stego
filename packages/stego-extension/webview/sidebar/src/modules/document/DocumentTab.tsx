import { For, Show, type JSX } from 'solid-js';
import type { SidebarWebviewState } from '@sidebar-protocol';
import {
  BackIcon,
  CheckIcon,
  CollapseIcon,
  CopyIcon,
  ExpandIcon,
  ImageIcon,
  LineJumpIcon,
  ListIcon,
  PreviewIcon
} from '../../components/icons';
import { ImageStylePills, ReferenceCards, RelativeTime, statusSummaryLabel } from '../../components/helpers';
import { RunMenu } from '../../components/runMenu';
import { sidebarActions } from '../../actions/actionCreators';
import { dispatchSidebarAction } from '../../actions/dispatch';

function StatusControl(props: { state: SidebarWebviewState }): JSX.Element {
  return (
    <Show when={props.state.mode === 'manuscript' && props.state.statusControl}>
      <div class="status-editor">
        <div class="status-options">
          <For each={props.state.statusControl?.options ?? []}>{(option) => (
            <label class="status-option">
              <input
                class="status-radio"
                type="radio"
                name="metadata-status"
                value={option}
                checked={props.state.statusControl?.value === option}
                onChange={(event) => dispatchSidebarAction(sidebarActions.setMetadataStatus(event.currentTarget.value))}
              />
              <span>{option}</span>
            </label>
          )}</For>
        </div>
        <Show when={props.state.statusControl?.invalidValue}>
          <div class="status-note warn">
            Unknown current status: <code>{props.state.statusControl?.invalidValue}</code>
          </div>
        </Show>
        <Show when={!props.state.statusControl?.invalidValue && !props.state.statusControl?.value}>
          <div class="status-note">No status set yet.</div>
        </Show>
      </div>
    </Show>
  );
}

function MetadataPanel(props: { state: SidebarWebviewState }): JSX.Element {
  const isManuscript = () => props.state.mode === 'manuscript';
  const visibleEntries = () => isManuscript()
    ? props.state.metadataEntries.filter((entry) => entry.key !== 'images')
    : props.state.metadataEntries;
  const showMetadataEditingControls = () => props.state.showMetadataPanel && props.state.metadataEditing;

  return (
    <Show when={props.state.showMetadataPanel}>
      <section class={`panel metadata-panel${props.state.metadataCollapsed ? ' collapsed' : ''}`}>
        <div class="panel-heading">
          <h2>Metadata</h2>
          <div class="explorer-nav">
            <Show when={!props.state.metadataCollapsed}>
              <button class="btn subtle" onClick={() => dispatchSidebarAction(sidebarActions.toggleMetadataEditing())}>
                {props.state.metadataEditing ? 'Done' : 'Edit'}
              </button>
            </Show>
            <button
              class="btn subtle btn-icon"
              aria-label={props.state.metadataCollapsed ? 'Expand' : 'Collapse'}
              title={props.state.metadataCollapsed ? 'Expand' : 'Collapse'}
              onClick={() => dispatchSidebarAction(sidebarActions.toggleMetadataCollapse())}
            >
              {props.state.metadataCollapsed ? <ExpandIcon /> : <CollapseIcon />}
            </button>
          </div>
        </div>

        <Show when={!props.state.metadataCollapsed}>
          <Show when={showMetadataEditingControls()}>
            <div class="actions">
              <button class="btn primary" onClick={() => dispatchSidebarAction(sidebarActions.addMetadataField())}>Add Field</button>
            </div>
          </Show>

          <div class="list">
            <Show when={visibleEntries().length > 0} fallback={<div class="empty">No metadata fields yet.</div>}>
              <For each={visibleEntries()}>{(entry) => (
                <Show
                  when={!entry.isArray}
                  fallback={(
                    <article class="item metadata-item metadata-array-field">
                      <div class="item-main">
                        <div class="item-title-row">
                          <code>{entry.key}</code>
                          <Show when={entry.isStructural}><span class="badge structural">Structural</span></Show>
                          <Show when={entry.isBranch}><span class="badge branch">Branch</span></Show>
                          <span class="badge">{entry.arrayItems.length} items</span>
                        </div>
                        <Show
                          when={entry.arrayItems.length > 0}
                          fallback={<div class="empty tiny">No items in this array.</div>}
                        >
                          <div class="array-list">
                            <For each={entry.arrayItems}>{(item) => (
                              <div class="array-item">
                                <div class="item-main">
                                  <div class="item-subtext metadata-value">{item.valueText}</div>
                                  <ReferenceCards references={item.references} />
                                </div>
                                <Show when={showMetadataEditingControls()}>
                                  <div class="item-actions">
                                    <button class="btn subtle" onClick={() => dispatchSidebarAction(sidebarActions.editMetadataArrayItem(entry.key, item.index))}>Edit</button>
                                    <button class="btn danger" onClick={() => dispatchSidebarAction(sidebarActions.removeMetadataArrayItem(entry.key, item.index))}>Remove</button>
                                  </div>
                                </Show>
                              </div>
                            )}</For>
                          </div>
                        </Show>
                        <Show when={showMetadataEditingControls()}>
                          <div class="array-field-actions">
                            <button class="btn subtle" onClick={() => dispatchSidebarAction(sidebarActions.addMetadataArrayItem(entry.key))}>Add Item</button>
                          </div>
                        </Show>
                      </div>
                    </article>
                  )}
                >
                  <article class="item metadata-item">
                    <div class="item-main">
                      <div class="item-title-row">
                        <code>{entry.key}</code>
                        <Show when={entry.isStructural}><span class="badge structural">Structural</span></Show>
                        <Show when={entry.isBranch}><span class="badge branch">Branch</span></Show>
                      </div>
                      <div class="item-subtext metadata-value">{entry.valueText}</div>
                      <ReferenceCards references={entry.references} />
                    </div>
                    <Show when={showMetadataEditingControls()}>
                      <div class="item-actions">
                        <button class="btn subtle" onClick={() => dispatchSidebarAction(sidebarActions.editMetadataField(entry.key))}>Edit</button>
                        <button class="btn danger" onClick={() => dispatchSidebarAction(sidebarActions.removeMetadataField(entry.key))}>Remove</button>
                      </div>
                    </Show>
                  </article>
                </Show>
              )}</For>
            </Show>
          </div>

          <Show when={props.state.mode === 'manuscript' && props.state.imageEntries.length > 0}>
            <section class="images-widget">
              <div class="images-widget-head">
                <h3>Images</h3>
                <div class="item-subtext tiny">
                  Project defaults: <ImageStylePills style={props.state.projectImageDefaults} />
                </div>
              </div>
              <div class="images-widget-list">
                <For each={props.state.imageEntries}>{(entry) => (
                  <article class="item metadata-item image-metadata-item">
                    <div class="item-main">
                      <div class="item-title-row">
                        <code>{entry.displayPath}</code>
                        <span class="badge">{entry.isExternal ? 'External' : 'Local'}</span>
                        <Show when={entry.occurrenceCount > 1}><span class="badge">{entry.occurrenceCount}x</span></Show>
                      </div>
                      <div class="item-subtext tiny image-metadata-meta">
                        <div class="image-style-value">
                          <ImageStylePills style={entry.effectiveStyle} />
                        </div>
                      </div>
                      <div class="image-line-row">
                        <button
                          class="btn subtle inline-toggle comment-jump-btn"
                          aria-label={`Jump to line ${entry.line}`}
                          title={`Jump to line ${entry.line}`}
                          onClick={() => dispatchSidebarAction(sidebarActions.openHeadingLine(entry.line))}
                        >
                          <LineJumpIcon /> Line {entry.line}
                        </button>
                      </div>
                    </div>
                    <div class="image-item-aside">
                      <Show when={entry.thumbnailSrc}>
                        <div class="image-thumb-wrap">
                          <img class="image-thumb" src={entry.thumbnailSrc} alt={`Preview: ${entry.displayPath}`} loading="lazy" />
                        </div>
                      </Show>
                      <Show when={showMetadataEditingControls()}>
                        <div class="item-actions image-item-actions">
                          <button class="btn subtle" onClick={() => dispatchSidebarAction(sidebarActions.editImageFormat(entry.key))}>Edit Format</button>
                          <button class="btn danger" onClick={() => dispatchSidebarAction(sidebarActions.resetImageToDefaults(entry.key))} disabled={!entry.hasOverride}>Reset</button>
                        </div>
                      </Show>
                    </div>
                  </article>
                )}</For>
              </div>
            </section>
          </Show>
        </Show>
      </section>
    </Show>
  );
}

function TocPanel(props: { state: SidebarWebviewState }): JSX.Element {
  return (
    <Show when={props.state.showToc}>
      <section class="panel">
        <div class="panel-heading">
          <h2>{props.state.isBranchNotesFile ? 'Leaf Links' : 'Table Of Contents'}</h2>
        </div>
        <Show when={props.state.isBranchNotesFile}>
          <div class="filter-row">
            <input
              class="filter-input"
              type="text"
              value={props.state.backlinkFilter}
              placeholder="Filter references by filename"
              onInput={(event) => dispatchSidebarAction(sidebarActions.setBacklinkFilter(event.currentTarget.value))}
            />
          </div>
        </Show>
        <div class="toc-list">
          <Show when={props.state.tocEntries.length > 0} fallback={<div class="empty">No headings found (H1-H3).</div>}>
            <For each={props.state.tocEntries}>{(entry) => (
              <article class="toc-item">
                <Show
                  when={props.state.isBranchNotesFile && entry.identifier}
                  fallback={<button class={`toc-link lvl-${entry.level}`} onClick={() => dispatchSidebarAction(sidebarActions.openHeadingLine(entry.line))}>{entry.heading}</button>}
                >
                  <button class={`toc-link lvl-${entry.level}`} onClick={() => entry.identifier && dispatchSidebarAction(sidebarActions.openIdentifier(entry.identifier.id))}>{entry.heading}</button>
                </Show>

                <Show when={entry.identifier}>
                  <div class="backlink-section">
                    <div class="item-title-row">
                      <button
                        class="btn subtle inline-toggle"
                        onClick={() => entry.identifier && dispatchSidebarAction(sidebarActions.toggleTocBacklinks(entry.identifier.id))}
                      >
                        {entry.backlinkCount} references{entry.backlinksExpanded ? ' (hide)' : ''}
                      </button>
                    </div>
                    <Show when={entry.backlinksExpanded}>
                      <Show when={entry.backlinks.length > 0} fallback={<div class="empty tiny">No matches for this identifier.</div>}>
                        <For each={entry.backlinks}>{(backlink) => (
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
                </Show>
              </article>
            )}</For>
          </Show>
        </div>
      </section>
    </Show>
  );
}

function CommentsPanel(props: { state: SidebarWebviewState }): JSX.Element {
  return (
    <Show when={props.state.enableComments}>
      <section class="panel comments-panel">
        <div class="panel-heading">
          <h2>Comments</h2>
          <div class="actions">
            <button class="btn subtle inline-toggle" onClick={() => dispatchSidebarAction(sidebarActions.clearResolvedComments())}>Clear Resolved</button>
          </div>
        </div>
        <div class="item-subtext comments-summary">{props.state.comments.totalCount} total • {props.state.comments.unresolvedCount} unresolved</div>
        <Show when={props.state.comments.parseErrors.length > 0}>
          <div class="error-panel">
            <For each={props.state.comments.parseErrors}>{(error, index) => (
              <>
                {index() > 0 ? <br /> : null}
                {error}
              </>
            )}</For>
          </div>
        </Show>

        <Show
          when={props.state.comments.items.length > 0}
          fallback={<div class="empty">No comments yet. To add one at the cursor location, run "Stego: Add Comment" from the Command Palette.</div>}
        >
          <For each={props.state.comments.items}>{(item) => (
            <article
              class={`item metadata-item comment-list-item${item.status === 'resolved' ? ' resolved' : ''}${item.isSelected ? ' selected' : ''}${item.threadPosition ? ` thread-${item.threadPosition}` : ''}`}
              data-id={item.id}
              onClick={() => dispatchSidebarAction(sidebarActions.selectCommentThread(item.id))}
            >
              <div class="item-main">
                <div class="item-title-row">
                  <span class={`badge${item.status === 'resolved' ? '' : ' warn'}`}>
                    {item.status === 'resolved' ? 'Resolved' : 'Unresolved'}
                  </span>
                  <Show when={item.degraded}><span class="badge warn">Moved</span></Show>
                </div>
                <div class="comment-message" innerHTML={item.messageHtml}></div>
                <Show when={!item.threadPosition || item.threadPosition === 'first'}>
                  <div class="item-subtext comment-anchor-excerpt">&quot;{item.excerpt.length > 100 ? `${item.excerpt.slice(0, 100)}…` : item.excerpt}&quot;</div>
                </Show>
                <div class="item-subtext tiny">
                  <Show when={item.author}>{item.author}</Show>
                  <Show when={item.created}> • <RelativeTime value={item.created} /></Show>
                </div>
              </div>

              <div class="item-actions comment-actions">
                <button
                  class="btn subtle inline-toggle comment-jump-btn"
                  aria-label={`Jump to line ${item.line}`}
                  title={`Jump to line ${item.line}`}
                  onClick={() => dispatchSidebarAction(sidebarActions.jumpToComment(item.id))}
                >
                  <LineJumpIcon /> Line {item.line}
                </button>
                <span class="comment-actions-spacer"></span>
                <Show when={!item.threadPosition || item.threadPosition === 'first'}>
                  <button
                    class="btn subtle inline-toggle"
                    onClick={() => dispatchSidebarAction(sidebarActions.toggleCommentResolved(item.id, item.threadPosition === 'first' ? true : undefined))}
                  >
                    {item.status === 'resolved'
                      ? (item.threadPosition === 'first' ? 'Unresolve Thread' : 'Unresolve')
                      : (item.threadPosition === 'first' ? 'Resolve Thread' : 'Resolve')}
                  </button>
                </Show>
                <button class="btn subtle inline-toggle" onClick={() => dispatchSidebarAction(sidebarActions.replyComment(item.id))}>Reply</button>
                <button class="btn danger inline-toggle" onClick={() => dispatchSidebarAction(sidebarActions.deleteComment(item.id))}>Delete</button>
              </div>
            </article>
          )}</For>
        </Show>
      </section>
    </Show>
  );
}

export function DocumentTab(props: { state: SidebarWebviewState }): JSX.Element {
  const showDocumentTab = () => props.state.showDocumentTab ?? props.state.hasActiveMarkdown;
  const isExploreDocument = () => props.state.mode === 'nonManuscript' && props.state.showMetadataPanel;
  const runLocalChecksLabel = () => `Run ${statusSummaryLabel(props.state)} check`;
  const copyCleanLabel = () => (isExploreDocument() ? 'Copy leaf text' : 'Copy manuscript text');

  return (
    <>
      <Show when={props.state.documentTabDetached && props.state.documentPath}>
        <div class="detached-document-banner">
          <span class="detached-document-arrow" aria-hidden="true"><BackIcon /></span>
          <button class="backlink-link detached-document-link" onClick={() => dispatchSidebarAction(sidebarActions.openOverviewFile(props.state.documentPath))}>
            {props.state.documentFilename || props.state.documentPath}
          </button>
        </div>
      </Show>

      <Show when={showDocumentTab() && (props.state.hasActiveMarkdown || props.state.documentTabDetached)}>
        <section class="panel title-panel">
          <div class="panel-heading">
            <div class="title-heading-block">
              <h2>{props.state.documentTitle}</h2>
              <Show when={props.state.showReferenceFilenameSubtitle && props.state.documentFileStem}>
                <div class="title-structure">{props.state.documentFileStem}</div>
              </Show>
            </div>
            <div class="actions">
              <RunMenu
                summaryLabel="Actions"
                items={[
                  ...(!isExploreDocument() ? [{ label: 'Run Stage Check', title: runLocalChecksLabel(), icon: <CheckIcon />, onSelect: () => dispatchSidebarAction(sidebarActions.runValidateCurrentFile()) }] : []),
                  { label: 'Open Markdown Preview', title: 'Open Markdown Preview', icon: <PreviewIcon />, onSelect: () => dispatchSidebarAction(sidebarActions.openPreview()) },
                  { label: 'Insert Image', title: 'Insert Image', icon: <ImageIcon />, onSelect: () => dispatchSidebarAction(sidebarActions.insertImage()) },
                  ...(!isExploreDocument() ? [{ label: 'Fill required metadata', title: 'Fill required metadata', icon: <ListIcon />, onSelect: () => dispatchSidebarAction(sidebarActions.fillRequiredMetadata()) }] : []),
                  { label: copyCleanLabel(), title: copyCleanLabel(), icon: <CopyIcon />, onSelect: () => dispatchSidebarAction(sidebarActions.copyCleanText()) }
                ]}
              />
            </div>
          </div>
          <StatusControl state={props.state} />
        </section>
      </Show>

      <Show when={props.state.parseError}>
        <div class="error-panel">Frontmatter parse error: {props.state.parseError}</div>
      </Show>

      <MetadataPanel state={props.state} />
      <TocPanel state={props.state} />
      <CommentsPanel state={props.state} />
    </>
  );
}
