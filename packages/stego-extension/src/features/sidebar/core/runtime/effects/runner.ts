import * as vscode from 'vscode';
import type { SidebarRuntimeEffect } from './types';

export class SidebarEffectRunner {
  public async run(effect: SidebarRuntimeEffect): Promise<void> {
    switch (effect.type) {
      case 'notification.warning':
        await vscode.window.showWarningMessage(effect.message);
        return;
      case 'notification.info':
        await vscode.window.showInformationMessage(effect.message);
        return;
      default:
        return;
    }
  }
}
