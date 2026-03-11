import type { JSX } from 'solid-js';

function NavIcon(props: { path: string; class?: string }): JSX.Element {
  return (
    <svg class={props.class ?? 'nav-icon'} viewBox="0 0 16 16" aria-hidden="true">
      <path d={props.path}></path>
    </svg>
  );
}

export function BackIcon(): JSX.Element {
  return <NavIcon path="M9.5 3L4.5 8l5 5 1.1-1.1L6.7 8l3.9-3.9z" />;
}

export function ForwardIcon(): JSX.Element {
  return <NavIcon path="M6.5 3L5.4 4.1 9.3 8l-3.9 3.9L6.5 13l5-5z" />;
}

export function HomeIcon(): JSX.Element {
  return <NavIcon path="M8 2l6 5v7h-4V9H6v5H2V7z" />;
}

export function CollapseIcon(): JSX.Element {
  return <NavIcon path="M3.4 5.4L8 10l4.6-4.6 1 1L8 12 2.4 6.4z" />;
}

export function ExpandIcon(): JSX.Element {
  return <NavIcon path="M10.6 3.4L6 8l4.6 4.6-1 1L4 8l5.6-5.6z" />;
}

export function LineJumpIcon(): JSX.Element {
  return <NavIcon path="M5.928 7.976l4.357-4.357-.618-.62L5 7.672v.618l4.667 4.632.618-.614L5.928 7.976z" />;
}

export function RunMenuChevronIcon(): JSX.Element {
  return <NavIcon path="M3.4 5.4L8 10l4.6-4.6 1 1L8 12 2.4 6.4z" />;
}

export function CheckIcon(): JSX.Element {
  return <NavIcon path="M13.78 3.97a.75.75 0 0 1 0 1.06L6.75 12.06a.75.75 0 0 1-1.06 0L2.22 8.59a.75.75 0 1 1 1.06-1.06l2.94 2.94 6.5-6.5a.75.75 0 0 1 1.06 0z" />;
}

export function CopyIcon(): JSX.Element {
  return (
    <svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 2.75A1.75 1.75 0 0 1 6.75 1h6.5A1.75 1.75 0 0 1 15 2.75v8.5A1.75 1.75 0 0 1 13.25 13h-6.5A1.75 1.75 0 0 1 5 11.25zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25z"></path>
      <path d="M1 4.75A1.75 1.75 0 0 1 2.75 3h.5a.75.75 0 0 1 0 1.5h-.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-.5a.75.75 0 0 1 1.5 0v.5A1.75 1.75 0 0 1 9.25 15h-6.5A1.75 1.75 0 0 1 1 13.25z"></path>
    </svg>
  );
}

export function ImageIcon(): JSX.Element {
  return <NavIcon path="M2.75 2h10.5c.414 0 .75.336.75.75v10.5a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75V2.75c0-.414.336-.75.75-.75zm.75 1.5v9h9v-9h-9zm1 6.5h6l-1.8-2.4-1.6 2-1.1-1.3L4.5 10zM5.5 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />;
}

export function ListIcon(): JSX.Element {
  return <NavIcon path="M2.75 2h10.5c.414 0 .75.336.75.75v10.5a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75V2.75c0-.414.336-.75.75-.75zm.75 1.5v9h9v-9h-9zm1.25 1.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5zm0 3h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5z" />;
}

export function FileIcon(): JSX.Element {
  return <NavIcon path="M3.75 1h4.19c.46 0 .9.18 1.22.5l2.34 2.34c.32.32.5.76.5 1.22v6.19A1.75 1.75 0 0 1 10.25 13h-6.5A1.75 1.75 0 0 1 2 11.25v-8.5A1.75 1.75 0 0 1 3.75 1zm0 1.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25V5.06a.25.25 0 0 0-.07-.18L8.09 2.57a.25.25 0 0 0-.18-.07H3.75z" />;
}

export function PreviewIcon(): JSX.Element {
  return <NavIcon path="M8 3C4.37 3 1.4 5.17.2 8c1.2 2.83 4.17 5 7.8 5s6.6-2.17 7.8-5C14.6 5.17 11.63 3 8 3zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-1.5A2 2 0 1 0 8 6a2 2 0 0 0 0 4z" />;
}

export function OpenMetricIcon(): JSX.Element {
  return <NavIcon path="M6.5 3L5.4 4.1 9.3 8l-3.9 3.9L6.5 13l5-5z" />;
}

export function PlusIcon(): JSX.Element {
  return <NavIcon path="M7.25 2a.75.75 0 0 1 1.5 0v5.25H14a.75.75 0 0 1 0 1.5H8.75V14a.75.75 0 0 1-1.5 0V8.75H2a.75.75 0 0 1 0-1.5h5.25z" />;
}
