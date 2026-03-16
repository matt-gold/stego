import * as vscode from 'vscode';
import { buildIndexFromHeadingScan } from './leafIndexModel';
import { buildProjectScanPlan, findNearestProjectConfig } from '../project';
import type { LeafTargetRecord } from '../../shared/types';

export class LeafIndexService {
  private readonly inferredCache = new Map<string, { stamp: string; index: Map<string, LeafTargetRecord> }>();

  public clear(): void {
    this.inferredCache.clear();
  }

  public async loadForDocument(document: vscode.TextDocument): Promise<Map<string, LeafTargetRecord>> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return new Map();
    }

    return this.loadInferredIndex(document, folder);
  }

  private async loadInferredIndex(
    document: vscode.TextDocument,
    folder: vscode.WorkspaceFolder
  ): Promise<Map<string, LeafTargetRecord>> {
    const project = await findNearestProjectConfig(document.uri.fsPath, folder.uri.fsPath);
    if (!project) {
      return new Map();
    }

    const scanPlan = await buildProjectScanPlan(project.projectDir);
    if (scanPlan.files.length === 0) {
      return new Map();
    }

    const cacheKey = project.projectDir;
    const stamp = [project.projectMtimeMs.toString(), ...scanPlan.stampParts].join('|');
    const cached = this.inferredCache.get(cacheKey);
    if (cached && cached.stamp === stamp) {
      return cached.index;
    }

    const index = await buildIndexFromHeadingScan(scanPlan.files, folder.uri.fsPath, project);
    this.inferredCache.set(cacheKey, { stamp, index });
    return index;
  }
}
