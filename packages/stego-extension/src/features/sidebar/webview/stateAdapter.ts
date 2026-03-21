import * as path from 'path';
import * as vscode from 'vscode';
import {
  extractImageDestinationTarget,
  isExternalImageTarget,
  stripImageQueryAndAnchor
} from '@stego-labs/shared/domain/images';
import type {
  SidebarExplorerPage,
  SidebarState
} from '../../../shared/types';
import type { SidebarWebviewState } from '../protocol';
import { getSidebarFileTitle } from '../tabs/document';
import { renderMarkdownForExplorer } from './renderMarkdownForExplorer';

const decodePathSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const hasUriScheme = (value: string): boolean => /^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(value);

const splitTargetSuffix = (target: string): { cleanTarget: string; suffix: string } => {
  const cleanTarget = stripImageQueryAndAnchor(target);
  if (!cleanTarget) {
    return { cleanTarget: '', suffix: '' };
  }
  if (target.startsWith(cleanTarget)) {
    return { cleanTarget, suffix: target.slice(cleanTarget.length) };
  }
  return { cleanTarget, suffix: '' };
};

function resolveWebviewImageSrc(webview: vscode.Webview, rawTarget: string, basePath?: string): string | undefined {
  const extracted = extractImageDestinationTarget(rawTarget);
  if (!extracted) {
    return undefined;
  }

  if (isExternalImageTarget(extracted)) {
    if (extracted.startsWith('https://') || extracted.startsWith('data:')) {
      return extracted;
    }
    return undefined;
  }
  if (extracted.startsWith('#')) {
    return undefined;
  }
  if (extracted.startsWith('file://')) {
    try {
      return webview.asWebviewUri(vscode.Uri.parse(extracted)).toString();
    } catch {
      return undefined;
    }
  }
  if (hasUriScheme(extracted)) {
    return undefined;
  }

  const { cleanTarget, suffix } = splitTargetSuffix(extracted);
  if (!cleanTarget) {
    return undefined;
  }

  const decodedTarget = cleanTarget
    .split('/')
    .map((segment) => decodePathSegment(segment))
    .join(path.sep);

  const resolvedPath = path.isAbsolute(decodedTarget)
    ? decodedTarget
    : (basePath && path.isAbsolute(basePath)
      ? path.resolve(path.dirname(basePath), decodedTarget)
      : undefined);

  if (!resolvedPath) {
    return undefined;
  }

  return `${webview.asWebviewUri(vscode.Uri.file(resolvedPath)).toString()}${suffix}`;
}

function resolveImageThumbnailSrc(
  webview: vscode.Webview,
  state: SidebarState,
  entry: SidebarState['imageEntries'][number]
): string | undefined {
  const fromDestination = resolveWebviewImageSrc(webview, entry.destination, state.documentPath);
  if (fromDestination) {
    return fromDestination;
  }

  const projectDir = state.projectDir?.trim();
  if (!projectDir) {
    return undefined;
  }

  const relativeKey = entry.key.trim();
  if (!relativeKey || relativeKey.startsWith('#')) {
    return undefined;
  }

  const decodedRelative = relativeKey
    .split('/')
    .map((segment) => decodePathSegment(segment))
    .join(path.sep);
  const filePath = path.resolve(projectDir, decodedRelative);
  return webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
}

function renderExplorerPage(
  webview: vscode.Webview,
  state: SidebarState,
  page: SidebarExplorerPage | undefined
): SidebarWebviewState['explorer'] | undefined {
  if (!page) {
    return undefined;
  }

  if (page.kind === 'identifier') {
    const sourceBodyHtml = page.entry.sourceBody
      ? renderMarkdownForExplorer(page.entry.sourceBody, {
        basePath: page.entry.sourceFilePath,
        resolveImageSrc: (rawSrc, basePath) => resolveWebviewImageSrc(webview, rawSrc, basePath)
      })
      : undefined;

    return {
      ...page,
      entry: {
        ...page.entry,
        sourceBodyHtml
      }
    };
  }

  if (!page.body) {
    return page;
  }

  return {
    ...page,
    body: renderMarkdownForExplorer(page.body, {
      basePath: state.projectDir
        ? path.join(state.projectDir, 'content', ...(page.branch.id ? page.branch.id.split('/') : []), '_branch.md')
        : state.documentPath,
      resolveImageSrc: (rawSrc, basePath) => resolveWebviewImageSrc(webview, rawSrc, basePath)
    })
  };
}

function renderPinnedExplorerPanels(
  webview: vscode.Webview,
  state: SidebarState,
  panels: SidebarState['pinnedExplorers']
): SidebarWebviewState['pinnedExplorers'] {
  return panels
    .map((panel) => {
      const rendered = renderExplorerPage(webview, state, panel.page);
      if (!rendered || rendered.kind !== 'identifier') {
        return undefined;
      }
      return {
        ...panel,
        page: rendered
      };
    })
    .filter((panel): panel is SidebarWebviewState['pinnedExplorers'][number] => !!panel);
}

export function toSidebarWebviewState(webview: vscode.Webview, state: SidebarState): SidebarWebviewState {
  const documentLabel = state.showMetadataPanel
    ? state.metadataEntries.find((entry) => entry.key === 'label' && !entry.isArray)?.valueText
    : undefined;
  const fileTitle = getSidebarFileTitle(state.documentPath, documentLabel);
  const fileStem = fileTitle.filename ? path.parse(fileTitle.filename).name : '';

  const comments: SidebarWebviewState['comments'] = {
    ...state.comments,
    items: state.comments.items.map((item) => ({
      ...item,
      messageHtml: renderMarkdownForExplorer(item.message, {
        basePath: state.documentPath,
        resolveImageSrc: (rawSrc, basePath) => resolveWebviewImageSrc(webview, rawSrc, basePath)
      })
    }))
  };

  const explorer = renderExplorerPage(webview, state, state.explorer);
  const pinnedExplorers = renderPinnedExplorerPanels(webview, state, state.pinnedExplorers);

  const imageEntries = state.imageEntries.map((entry) => ({
    ...entry,
    thumbnailSrc: resolveImageThumbnailSrc(webview, state, entry)
  }));

  return {
    ...state,
    documentTitle: fileTitle.title,
    documentFilename: fileTitle.filename,
    documentFileStem: fileStem,
    comments,
    explorer,
    pinnedExplorers,
    imageEntries
  };
}
