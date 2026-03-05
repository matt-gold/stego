import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { asString } from '../../shared/value';
import type { SidebarStatusControl } from '../../shared/types';
import { findNearestFileUpward } from '../project/projectConfig';
import { DEFAULT_ALLOWED_STATUSES } from '../../../../shared/src/domain/stages';

export async function buildStatusControl(
  frontmatter: Record<string, unknown>,
  document: vscode.TextDocument
): Promise<SidebarStatusControl> {
  const options = await resolveAllowedStatuses(document);
  const rawStatus = asString(frontmatter.status);
  if (!rawStatus) {
    return { options };
  }

  const normalizedRaw = rawStatus.toLowerCase();
  const matched = options.find((option) => option.toLowerCase() === normalizedRaw);
  if (matched) {
    return { options, value: matched };
  }

  return { options, invalidValue: rawStatus };
}

export async function resolveAllowedStatuses(document: vscode.TextDocument): Promise<string[]> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) {
    return [...DEFAULT_ALLOWED_STATUSES];
  }

  const configPath = await findNearestFileUpward(document.uri.fsPath, folder.uri.fsPath, 'stego.config.json');
  if (!configPath) {
    return [...DEFAULT_ALLOWED_STATUSES];
  }

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [...DEFAULT_ALLOWED_STATUSES];
    }

    const value = (parsed as Record<string, unknown>).allowedStatuses;
    if (!Array.isArray(value)) {
      return [...DEFAULT_ALLOWED_STATUSES];
    }

    const options: string[] = [];
    const seen = new Set<string>();
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }

      const normalized = entry.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      options.push(normalized);
    }

    return options.length > 0 ? options : [...DEFAULT_ALLOWED_STATUSES];
  } catch {
    return [...DEFAULT_ALLOWED_STATUSES];
  }
}
