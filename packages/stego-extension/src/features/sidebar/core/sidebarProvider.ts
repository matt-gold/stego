import * as vscode from 'vscode';
import type { WorkflowRunResult } from '../../commands';
import { ReferenceUsageIndexService, LeafIndexService } from '../../indexing';
import type { ProjectScanContext } from '../../../shared/types';
import { SidebarRuntime } from './runtime/sidebarRuntime';
import type { RefreshMode } from './sidebarProvider.types';

export class MetadataSidebarProvider implements vscode.WebviewViewProvider {
  private readonly runtime: SidebarRuntime;

  constructor(
    extensionUri: vscode.Uri,
    indexService: LeafIndexService,
    referenceUsageService: ReferenceUsageIndexService,
    diagnostics: vscode.DiagnosticCollection
  ) {
    this.runtime = new SidebarRuntime(extensionUri, indexService, referenceUsageService, diagnostics);
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.runtime.resolveWebviewView(webviewView);
  }

  public async focusIdentifier(id: string): Promise<void> {
    await this.runtime.focusIdentifier(id);
  }

  public async focusComment(id: string): Promise<void> {
    await this.runtime.focusComment(id);
  }

  public expandMetadataPanel(): void {
    this.runtime.expandMetadataPanel();
  }

  public async recordGateWorkflowResult(
    key: 'stageCheck' | 'build',
    result: WorkflowRunResult
  ): Promise<void> {
    await this.runtime.recordGateWorkflowResult(key, result);
  }

  public scheduleRefresh(options?: { mode?: RefreshMode; debounceMs?: number }): void {
    this.runtime.scheduleRefresh(options);
  }

  public markOverviewFileDirty(filePath: string, options?: { commentsChanged?: boolean }): void {
    this.runtime.markOverviewFileDirty(filePath, options);
  }

  public markOverviewProjectDirty(projectDir: string, options?: { commentsChanged?: boolean }): void {
    this.runtime.markOverviewProjectDirty(projectDir, options);
  }

  public clearOverviewProject(projectDir: string): void {
    this.runtime.clearOverviewProject(projectDir);
  }

  public async prewarmOverview(projectContext: ProjectScanContext): Promise<void> {
    await this.runtime.prewarmOverview(projectContext);
  }

  public async refresh(mode: RefreshMode = 'full'): Promise<void> {
    await this.runtime.refresh(mode);
  }
}
