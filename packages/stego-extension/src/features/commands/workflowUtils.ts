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

export type WorkflowScriptName = 'build' | 'export' | 'check-stage' | 'validate' | 'new';

export type WorkflowCommandInvocation = {
  command: string;
  args: string[];
  runner: 'script' | 'stego';
};

type StegoRunner = {
  command: string;
  prefixArgs: string[];
  label: string;
};

type PackageScriptState = {
  packagePath: string;
  hasPackageJson: boolean;
  scripts: Set<string>;
};

const stegoRunnerPromiseByCwd = new Map<string, Promise<StegoRunner | undefined>>();

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

function getNpmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function getNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

async function canExecute(command: string, args: string[], cwd: string): Promise<boolean> {
  try {
    const result = await runCommand(command, args, cwd);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function detectStegoRunner(cwd: string): Promise<StegoRunner | undefined> {
  if (await canExecute('stego', ['--version'], cwd)) {
    return {
      command: 'stego',
      prefixArgs: [],
      label: 'stego'
    };
  }

  const npxCommand = getNpxCommand();
  if (await canExecute(npxCommand, ['--no-install', 'stego', '--version'], cwd)) {
    return {
      command: npxCommand,
      prefixArgs: ['--no-install', 'stego'],
      label: 'npx --no-install stego'
    };
  }

  return undefined;
}

async function resolveStegoRunner(cwd: string): Promise<StegoRunner | undefined> {
  const cacheKey = path.resolve(cwd);
  const existing = stegoRunnerPromiseByCwd.get(cacheKey);
  if (existing) {
    return existing;
  }

  const detection = detectStegoRunner(cwd).then((runner) => {
    if (!runner) {
      // Allow retry later (for example after package install or PATH changes).
      stegoRunnerPromiseByCwd.delete(cacheKey);
    }
    return runner;
  });
  stegoRunnerPromiseByCwd.set(cacheKey, detection);
  return detection;
}

export async function resolveProjectScriptContext(): Promise<ProjectScriptContext | undefined> {
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
  let hasPackageJson = false;
  const scripts = new Set<string>();
  try {
    const packageRaw = await fs.readFile(packagePath, 'utf8');
    hasPackageJson = true;

    try {
      const parsed = JSON.parse(packageRaw) as unknown;
      const candidateScripts = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).scripts
        : undefined;

      if (candidateScripts && typeof candidateScripts === 'object' && !Array.isArray(candidateScripts)) {
        for (const [scriptName, scriptValue] of Object.entries(candidateScripts)) {
          if (typeof scriptValue === 'string' && scriptName.trim().length > 0) {
            scripts.add(scriptName.trim());
          }
        }
      }
    } catch {
      // Ignore invalid package.json content and rely on CLI fallback.
    }
  } catch {
    hasPackageJson = false;
  }

  return {
    document,
    projectDir: project.projectDir,
    projectId: path.basename(project.projectDir),
    packagePath,
    hasPackageJson,
    scripts
  };
}

export async function resolveWorkflowCommandInvocation(
  context: ProjectScriptContext,
  options: {
    scriptName: WorkflowScriptName;
    scriptArgs?: string[];
    stegoArgs: string[];
    actionLabel: string;
  }
): Promise<WorkflowCommandInvocation | undefined> {
  const npmCommand = getNpmCommand();
  const scriptArgs = options.scriptArgs ?? [];

  if (context.scripts.has(options.scriptName)) {
    const args = ['run', options.scriptName];
    if (scriptArgs.length > 0) {
      args.push('--', ...scriptArgs);
    }

    return {
      command: npmCommand,
      args,
      runner: 'script'
    };
  }

  const stegoRunner = await resolveStegoRunner(context.projectDir);
  if (!stegoRunner) {
    const packageHint = context.hasPackageJson
      ? `Script '${options.scriptName}' is not defined in ${context.packagePath}.`
      : `No package.json found in ${context.projectDir}.`;
    void vscode.window.showWarningMessage(
      `${packageHint} Install stego-cli (or add the script) to run ${options.actionLabel}.`
    );
    return undefined;
  }

  return {
    command: stegoRunner.command,
    args: [...stegoRunner.prefixArgs, ...options.stegoArgs],
    runner: 'stego'
  };
}

export async function resolveStegoCommandInvocation(
  cwd: string,
  stegoArgs: string[],
  actionLabel: string
): Promise<WorkflowCommandInvocation | undefined> {
  const stegoRunner = await resolveStegoRunner(cwd);
  if (!stegoRunner) {
    void vscode.window.showWarningMessage(
      `Install stego-cli to run ${actionLabel}.`
    );
    return undefined;
  }

  return {
    command: stegoRunner.command,
    args: [...stegoRunner.prefixArgs, ...stegoArgs],
    runner: 'stego'
  };
}

export async function resolveWorkspaceCommandInvocation(
  workspaceDir: string,
  options: {
    scriptName: string;
    scriptArgs?: string[];
    stegoArgs: string[];
    actionLabel: string;
  }
): Promise<WorkflowCommandInvocation | undefined> {
  const scriptState = await readPackageScriptState(workspaceDir);
  const scriptArgs = options.scriptArgs ?? [];
  const npmCommand = getNpmCommand();

  if (scriptState.scripts.has(options.scriptName)) {
    const args = ['run', options.scriptName];
    if (scriptArgs.length > 0) {
      args.push('--', ...scriptArgs);
    }
    return {
      command: npmCommand,
      args,
      runner: 'script'
    };
  }

  const stegoRunner = await resolveStegoRunner(workspaceDir);
  if (!stegoRunner) {
    const packageHint = scriptState.hasPackageJson
      ? `Script '${options.scriptName}' is not defined in ${scriptState.packagePath}.`
      : `No package.json found in ${workspaceDir}.`;
    void vscode.window.showWarningMessage(
      `${packageHint} Install stego-cli (or add the script) to run ${options.actionLabel}.`
    );
    return undefined;
  }

  return {
    command: stegoRunner.command,
    args: [...stegoRunner.prefixArgs, ...options.stegoArgs],
    runner: 'stego'
  };
}

async function readPackageScriptState(cwd: string): Promise<PackageScriptState> {
  const packagePath = path.join(cwd, 'package.json');
  const scripts = new Set<string>();
  let hasPackageJson = false;

  try {
    const packageRaw = await fs.readFile(packagePath, 'utf8');
    hasPackageJson = true;
    try {
      const parsed = JSON.parse(packageRaw) as unknown;
      const candidateScripts = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).scripts
        : undefined;

      if (candidateScripts && typeof candidateScripts === 'object' && !Array.isArray(candidateScripts)) {
        for (const [scriptName, scriptValue] of Object.entries(candidateScripts)) {
          if (typeof scriptValue === 'string' && scriptName.trim().length > 0) {
            scripts.add(scriptName.trim());
          }
        }
      }
    } catch {
      // Ignore invalid package content and rely on CLI fallback.
    }
  } catch {
    hasPackageJson = false;
  }

  return {
    packagePath,
    hasPackageJson,
    scripts
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
