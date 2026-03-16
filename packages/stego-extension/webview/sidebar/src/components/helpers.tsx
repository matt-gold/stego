import { For, Show, type JSX } from 'solid-js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { ImageStyle, SidebarIdentifierLink, SidebarWebviewState } from '@sidebar-protocol';
import { sidebarActions } from '../actions/actionCreators';
import { dispatchSidebarAction } from '../actions/dispatch';

dayjs.extend(relativeTime);

export function gateStateBadgeClass(state: 'never' | 'success' | 'failed'): string {
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

export function gateStateLabel(state: 'never' | 'success' | 'failed'): string {
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

export function RelativeTime(props: { value?: string }): JSX.Element {
  return <>{props.value ? dayjs(props.value).fromNow() : ''}</>;
}

export function ImageStylePills(props: { style: ImageStyle }): JSX.Element {
  const attrs = () => Object.entries(props.style.attrs ?? {})
    .filter(([key]) => key !== 'data-layout' && key !== 'data-align')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');

  return (
    <>
      <Show when={props.style.layout}><span class="badge">layout={props.style.layout}</span></Show>
      <Show when={props.style.align}><span class="badge">align={props.style.align}</span></Show>
      <Show when={props.style.width}><span class="badge">width={props.style.width}</span></Show>
      <Show when={props.style.height}><span class="badge">height={props.style.height}</span></Show>
      <Show when={props.style.id}><span class="badge">#{props.style.id}</span></Show>
      <Show when={props.style.classes && props.style.classes.length > 0}>
        <span class="badge">classes={props.style.classes?.join(', ')}</span>
      </Show>
      <Show when={attrs().length > 0}><span class="badge">{`attrs={${attrs()}}`}</span></Show>
      <Show when={
        !props.style.layout
        && !props.style.align
        && !props.style.width
        && !props.style.height
        && !props.style.id
        && (!props.style.classes || props.style.classes.length === 0)
        && attrs().length === 0
      }>
        <span class="item-subtext tiny">none</span>
      </Show>
    </>
  );
}

export function ReferenceCards(props: { references: SidebarIdentifierLink[] }): JSX.Element {
  return (
    <Show when={props.references.length > 0}>
      <div class="meta-reference-list">
        <For each={props.references}>{(reference) => {
          const showTitle = reference.title.trim().length > 0
            && reference.title.trim().toUpperCase() !== reference.id.toUpperCase();
          return (
            <div class="meta-reference">
              <div class="item-title-row">
                <button class="id-link" onClick={() => dispatchSidebarAction(sidebarActions.openIdentifier(reference.id))}>{reference.id}</button>
                <Show when={showTitle}><span class="item-title-text">{reference.title}</span></Show>
                <Show when={!reference.known}><span class="badge warn">Missing</span></Show>
              </div>
              <Show when={reference.description}>
                <div class="item-subtext">{reference.description}</div>
              </Show>
            </div>
          );
        }}</For>
      </div>
    </Show>
  );
}

export function statusSummaryLabel(state: SidebarWebviewState): string {
  if (!state.statusControl) {
    return 'stage';
  }

  return state.statusControl.value?.trim() || state.statusControl.invalidValue?.trim() || 'stage';
}
