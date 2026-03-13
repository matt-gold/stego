import { For, type JSX } from 'solid-js';
import { RunMenuChevronIcon } from './icons';

export type RunMenuItem = {
  label: string;
  title?: string;
  icon: JSX.Element;
  onSelect: () => void;
};

export function RunMenu(props: {
  summaryLabel: string;
  items: RunMenuItem[];
}): JSX.Element {
  return (
    <details class="run-menu">
      <summary class="btn subtle run-menu-summary">
        {props.summaryLabel}
        <RunMenuChevronIcon />
      </summary>
      <div class="run-menu-panel">
        <For each={props.items}>{(item) => (
          <button
            class="run-menu-item"
            aria-label={item.label}
            title={item.title ?? item.label}
            onClick={() => item.onSelect()}
          >
            <span class="run-menu-item-icon">{item.icon}</span>
            <span class="run-menu-item-label">{item.label}</span>
          </button>
        )}</For>
      </div>
    </details>
  );
}
