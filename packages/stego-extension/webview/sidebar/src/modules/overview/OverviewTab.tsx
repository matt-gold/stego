import { For, Show, type JSX } from 'solid-js';
import type { SidebarWebviewState } from '@sidebar-protocol';
import { CheckIcon, FileIcon, OpenMetricIcon, PlusIcon } from '../../components/icons';
import { gateStateBadgeClass, gateStateLabel, RelativeTime } from '../../components/helpers';
import { RunMenu } from '../../components/runMenu';
import { sidebarActions } from '../../actions/actionCreators';
import { dispatchSidebarAction } from '../../actions/dispatch';

function TemplatesPanel(props: { state: SidebarWebviewState }): JSX.Element {
  return (
    <Show when={props.state.templates.length > 0}>
      <section class="panel">
        <div class="panel-heading">
          <h2>Templates</h2>
        </div>
        <div class="list">
          <For each={props.state.templates}>{(template) => (
            <article class="item metadata-item">
              <div class="item-main">
                <div class="item-title-row">
                  <button
                    class="backlink-link"
                    onClick={() => dispatchSidebarAction(sidebarActions.openBacklink(template.path, 1))}
                  >
                    {template.name}
                  </button>
                  <For each={template.supportedTargets}>{(target) => (
                    <span class="badge">{target}</span>
                  )}</For>
                </div>
                <div class="item-subtext">{template.relativePath}</div>
              </div>
            </article>
          )}</For>
        </div>
      </section>
    </Show>
  );
}

export function OverviewTab(props: { state: SidebarWebviewState }): JSX.Element {
  const manuscriptTitle = () => props.state.overview?.manuscriptTitle ?? 'Manuscript';

  return (
    <section class="panel title-panel">
      <div class="panel-heading">
        <div class="title-heading-block">
          <h2>{manuscriptTitle()}</h2>
          <Show when={props.state.overview?.generatedAt}>
            <div class="title-structure">Last updated <RelativeTime value={props.state.overview?.generatedAt} /></div>
          </Show>
        </div>
        <div class="actions">
          <RunMenu
            summaryLabel="Actions"
            items={[
              { label: 'New Leaf', title: 'New Leaf', icon: <PlusIcon />, onSelect: () => dispatchSidebarAction(sidebarActions.runNewManuscript()) },
              { label: 'Compile Full Manuscript', title: 'Run Build', icon: <FileIcon />, onSelect: () => dispatchSidebarAction(sidebarActions.runCompile()) },
              { label: 'Run Stage Check', title: 'Run Stage Check', icon: <CheckIcon />, onSelect: () => dispatchSidebarAction(sidebarActions.runStageCheck()) }
            ]}
          />
        </div>
      </div>

      <Show when={props.state.overviewLoading}>
        <div class="status-note overview-gate-error">Loading manuscript overview...</div>
      </Show>

      <Show when={props.state.overview}>
        <div class="overview-stage">
          <div class="overview-stage-list">
            <div class="overview-gate-item">
              <div class="overview-stage-row">
                <span>Stage Check Result</span>
                <div class="overview-status-actions">
                  <span class={`badge ${gateStateBadgeClass(props.state.overview?.gateSnapshot.stageCheck.state ?? 'never')}`}>
                    {gateStateLabel(props.state.overview?.gateSnapshot.stageCheck.state ?? 'never')}
                  </span>
                </div>
              </div>
              <Show when={props.state.overview?.gateSnapshot.stageCheck.stage}>
                <div class="item-subtext tiny">Stage: {props.state.overview?.gateSnapshot.stageCheck.stage}</div>
              </Show>
              <Show when={props.state.overview?.gateSnapshot.stageCheck.updatedAt}>
                <div class="item-subtext tiny"><RelativeTime value={props.state.overview?.gateSnapshot.stageCheck.updatedAt} /></div>
              </Show>
              <Show when={
                props.state.overview?.gateSnapshot.stageCheck.detail
                && (props.state.overview?.gateSnapshot.stageCheck.detailKind === 'warning'
                  || props.state.overview?.gateSnapshot.stageCheck.detailKind === 'error')
              }>
                <div class={`status-note ${props.state.overview?.gateSnapshot.stageCheck.detailKind === 'error' ? 'error' : 'warn'} overview-gate-error`}>
                  {props.state.overview?.gateSnapshot.stageCheck.detail}
                </div>
              </Show>
            </div>

            <div class="overview-gate-item">
              <div class="overview-stage-row">
                <span>Compile Result</span>
                <div class="overview-status-actions">
                  <span class={`badge ${gateStateBadgeClass(props.state.overview?.gateSnapshot.build.state ?? 'never')}`}>
                    {gateStateLabel(props.state.overview?.gateSnapshot.build.state ?? 'never')}
                  </span>
                </div>
              </div>
              <Show when={props.state.overview?.gateSnapshot.build.detail && props.state.overview?.gateSnapshot.build.detailKind === 'output'}>
                <div class="item-subtext tiny">Output: {props.state.overview?.gateSnapshot.build.detail}</div>
              </Show>
              <Show when={props.state.overview?.gateSnapshot.build.updatedAt}>
                <div class="item-subtext tiny"><RelativeTime value={props.state.overview?.gateSnapshot.build.updatedAt} /></div>
              </Show>
              <Show when={
                props.state.overview?.gateSnapshot.build.detail
                && (props.state.overview?.gateSnapshot.build.detailKind === 'warning'
                  || props.state.overview?.gateSnapshot.build.detailKind === 'error')
              }>
                <div class={`status-note ${props.state.overview?.gateSnapshot.build.detailKind === 'error' ? 'error' : 'warn'} overview-gate-error`}>
                  {props.state.overview?.gateSnapshot.build.detail}
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={props.state.overview}>
        <div class="overview-metrics">
          <div class="overview-metric-row">
            <article class="item metadata-item overview-metric-card neutral">
              <div class="item-main">
                <div class="item-title-row"><span class="item-title-text">Word Count</span></div>
                <div class="metadata-value">{props.state.overview?.wordCount.toLocaleString()}</div>
              </div>
            </article>
            <article class="item metadata-item overview-metric-card neutral">
              <div class="item-main">
                <div class="item-title-row"><span class="item-title-text">Leaf Count</span></div>
                <div class="metadata-value">{props.state.overview?.manuscriptFileCount.toLocaleString()}</div>
              </div>
            </article>
          </div>

          <div class="overview-metric-row">
            <article class={`item metadata-item overview-metric-card ${(props.state.overview?.missingRequiredMetadataCount ?? 0) === 0 ? 'ok' : 'error'}`}>
              <div class="item-main">
                <div class="item-title-row"><span class="item-title-text">Missing Required Metadata</span></div>
                <div class="metadata-value">{props.state.overview?.missingRequiredMetadataCount.toLocaleString()}</div>
              </div>
              <div class="metric-card-actions">
                <button
                  class="btn subtle btn-icon metric-card-action"
                  aria-label="Open next file"
                  title="Open next file"
                  disabled={!props.state.overview?.firstMissingMetadata}
                  onClick={() => {
                    const filePath = props.state.overview?.firstMissingMetadata?.filePath;
                    if (filePath) {
                      dispatchSidebarAction(sidebarActions.openFirstMissingMetadata(filePath));
                    }
                  }}
                >
                  <OpenMetricIcon />
                </button>
              </div>
            </article>

            <article class={`item metadata-item overview-metric-card ${(props.state.overview?.unresolvedCommentsCount ?? 0) === 0 ? 'ok' : 'warn'}`}>
              <div class="item-main">
                <div class="item-title-row"><span class="item-title-text">Unresolved Comments</span></div>
                <div class="metadata-value">{props.state.overview?.unresolvedCommentsCount.toLocaleString()}</div>
              </div>
              <div class="metric-card-actions">
                <button
                  class="btn subtle btn-icon metric-card-action"
                  aria-label="Open next file"
                  title="Open next file"
                  disabled={!props.state.overview?.firstUnresolvedComment}
                  onClick={() => {
                    const next = props.state.overview?.firstUnresolvedComment;
                    if (next) {
                      dispatchSidebarAction(sidebarActions.openFirstUnresolvedComment(next.filePath, next.commentId));
                    }
                  }}
                >
                  <OpenMetricIcon />
                </button>
              </div>
            </article>
          </div>
        </div>
      </Show>

      <div class="overview-structure">
        <TemplatesPanel state={props.state} />

        <Show
          when={props.state.overview && props.state.overview.mapRows.length > 0}
          fallback={<div class="empty tiny">{props.state.overviewLoading ? 'Loading leaves with status...' : 'No leaves with status.'}</div>}
        >
          <div class="overview-file-list">
            <For each={props.state.overview?.mapRows ?? []}>{(row) => (
              <article class="item metadata-item overview-file-item">
                <div class="item-main">
                  <div class="item-title-row">
                    <button
                      class="backlink-link"
                      onClick={() => {
                        dispatchSidebarAction(sidebarActions.openOverviewFile(row.filePath));
                      }}
                    >
                      {row.fileLabel}
                    </button>
                    <span class="badge">{row.status}</span>
                  </div>
                </div>
              </article>
            )}</For>
          </div>
        </Show>
      </div>
    </section>
  );
}
