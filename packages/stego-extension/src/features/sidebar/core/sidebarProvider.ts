import * as vscode from 'vscode';
import type { WorkflowRunResult } from '../../commands';
import { ReferenceUsageIndexService, SpineIndexService } from '../../indexing';
import { SidebarRuntime } from './runtime/sidebarRuntime';
import type { RefreshMode } from './sidebarProvider.types';

export class MetadataSidebarProvider implements vscode.WebviewViewProvider {
  private readonly runtime: SidebarRuntime;

  constructor(
    extensionUri: vscode.Uri,
    indexService: SpineIndexService,
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

  public async refresh(mode: RefreshMode = 'full'): Promise<void> {
    await this.runtime.refresh(mode);
  }
}
