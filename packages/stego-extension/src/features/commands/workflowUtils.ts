import * as path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import type { ProjectScriptContext, ScriptRunResult } from '../../shared/types';
import { findNearestProjectConfig } from '../project/projectConfig';
import { getActiveMarkdownDocument } from '../metadata/frontmatterEdit';

export type WorkflowRunResult = {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
  outputPath?: string;
  projectDir?: string;
  stage?: string;
};

export async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<ScriptRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

export function pickToastDetails(result: ScriptRunResult): string {
  const text = `${result.stderr}\n${result.stdout}`.trim();
  if (!text) {
    return '';
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return '';
  }

  return lines[lines.length - 1];
}

export async function resolveProjectScriptContext(requiredScripts: string[]): Promise<ProjectScriptContext | undefined> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return undefined;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    void vscode.window.showWarningMessage('Open this file inside a workspace to run project scripts.');
    return undefined;
  }

  const project = await findNearestProjectConfig(document.uri.fsPath, workspaceFolder.uri.fsPath);
  if (!project) {
    void vscode.window.showWarningMessage('Could not find a stego-project.json for this file.');
    return undefined;
  }

  const packagePath = path.join(project.projectDir, 'package.json');
  let packageRaw: string;
  try {
    packageRaw = await fs.readFile(packagePath, 'utf8');
  } catch {
    void vscode.window.showWarningMessage(`No package.json found in ${project.projectDir}.`);
    return undefined;
  }

  let scripts: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(packageRaw) as unknown;
    const candidateScripts = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).scripts
      : undefined;
    if (candidateScripts && typeof candidateScripts === 'object' && !Array.isArray(candidateScripts)) {
      scripts = candidateScripts as Record<string, unknown>;
    }
  } catch {
    scripts = {};
  }

  for (const requiredScript of requiredScripts) {
    if (typeof scripts[requiredScript] !== 'string') {
      void vscode.window.showWarningMessage(`Script '${requiredScript}' is not defined in ${packagePath}.`);
      return undefined;
    }
  }

  return {
    document,
    projectDir: project.projectDir,
    packagePath
  };
}

export function toProjectRelativePath(projectDir: string, filePath: string): string | undefined {
  const normalizedProject = path.resolve(projectDir);
  const normalizedFile = path.resolve(filePath);
  const relative = path.relative(normalizedProject, normalizedFile);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }

  return relative.split(path.sep).join('/');
}

export function extractOutputPath(result: ScriptRunResult): string | undefined {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (!text) {
    return undefined;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(/(?:Build output|Export output):\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const outputPath = match[1].trim();
    if (outputPath) {
      return outputPath;
    }
  }

  return undefined;
}

export function commandError(prefix: string, error: unknown): string {
  return `${prefix}: ${errorToMessage(error)}`;
}
