import * as vscode from 'vscode';
import { STRINGS } from '../../shared/strings';
import { errorToMessage } from '../../shared/errors';
import {
  formatMetadataValue,
  isValidMetadataKey,
  parseMarkdownDocument,
  parseMetadataInput,
  serializeMarkdownDocument
} from './frontmatterParse';

export function getActiveMarkdownDocument(showMessage: boolean): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    if (showMessage) {
      void vscode.window.showWarningMessage(STRINGS.openMarkdownWarning);
    }
    return undefined;
  }

  return editor.document;
}

export async function writeParsedDocument(document: vscode.TextDocument, parsed: ReturnType<typeof parseMarkdownDocument>): Promise<boolean> {
  const nextText = serializeMarkdownDocument(parsed);
  const changed = await replaceDocumentText(document, nextText);
  if (!changed) {
    return false;
  }

  try {
    await document.save();
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not auto-save metadata changes: ${errorToMessage(error)}`);
  }

  return true;
}

export async function replaceDocumentText(document: vscode.TextDocument, nextText: string): Promise<boolean> {
  const currentText = document.getText();
  if (currentText === nextText) {
    return false;
  }

  const end = document.positionAt(currentText.length);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), end), nextText);
  return vscode.workspace.applyEdit(edit);
}

export async function promptAndAddMetadataField(): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  const key = (await vscode.window.showInputBox({
    prompt: 'Metadata key (top-level frontmatter key)',
    placeHolder: 'example: title'
  }))?.trim();

  if (!key) {
    return;
  }

  if (!isValidMetadataKey(key)) {
    void vscode.window.showWarningMessage('Metadata key must match /^[A-Za-z0-9_-]+$/.');
    return;
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const valueInput = await vscode.window.showInputBox({
    prompt: `Value for '${key}' (YAML syntax supported)`,
    placeHolder: 'example: Draft 2'
  });

  if (valueInput === undefined) {
    return;
  }

  parsed.frontmatter[key] = parseMetadataInput(valueInput);
  await writeParsedDocument(document, parsed);
}

export async function promptAndEditMetadataField(key: string): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  if (!(key in parsed.frontmatter)) {
    return;
  }

  const current = parsed.frontmatter[key];
  const edited = await vscode.window.showInputBox({
    prompt: `New value for '${key}' (YAML syntax supported)`,
    value: formatMetadataValue(current)
  });

  if (edited === undefined) {
    return;
  }

  parsed.frontmatter[key] = parseMetadataInput(edited);
  await writeParsedDocument(document, parsed);
}

export async function setMetadataStatus(value: string): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  parsed.frontmatter.status = value.trim().toLowerCase();
  await writeParsedDocument(document, parsed);
}

export async function promptAndAddMetadataArrayItem(key: string): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const current = parsed.frontmatter[key];
  if (!Array.isArray(current)) {
    void vscode.window.showWarningMessage(`'${key}' is not an array field.`);
    return;
  }

  const valueInput = await vscode.window.showInputBox({
    prompt: `Add item to '${key}' (YAML syntax supported)`,
    placeHolder: 'example: LOC-ASDF'
  });

  if (valueInput === undefined) {
    return;
  }

  current.push(parseMetadataInput(valueInput));
  parsed.frontmatter[key] = current;
  await writeParsedDocument(document, parsed);
}

export async function promptAndEditMetadataArrayItem(key: string, index: number): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const current = parsed.frontmatter[key];
  if (!Array.isArray(current)) {
    void vscode.window.showWarningMessage(`'${key}' is not an array field.`);
    return;
  }

  if (index < 0 || index >= current.length) {
    return;
  }

  const edited = await vscode.window.showInputBox({
    prompt: `Edit item ${index + 1} in '${key}' (YAML syntax supported)`,
    value: formatMetadataValue(current[index])
  });

  if (edited === undefined) {
    return;
  }

  current[index] = parseMetadataInput(edited);
  parsed.frontmatter[key] = current;
  await writeParsedDocument(document, parsed);
}

export async function removeMetadataField(key: string): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  if (!(key in parsed.frontmatter)) {
    return;
  }

  if (Array.isArray(parsed.frontmatter[key])) {
    void vscode.window.showWarningMessage(`Delete array items in '${key}' to remove this field.`);
    return;
  }

  delete parsed.frontmatter[key];
  await writeParsedDocument(document, parsed);
}

export async function removeMetadataArrayItem(key: string, index: number): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const current = parsed.frontmatter[key];
  if (!Array.isArray(current)) {
    void vscode.window.showWarningMessage(`'${key}' is not an array field.`);
    return;
  }

  if (index < 0 || index >= current.length) {
    return;
  }

  current.splice(index, 1);
  if (current.length === 0) {
    delete parsed.frontmatter[key];
  } else {
    parsed.frontmatter[key] = current;
  }

  await writeParsedDocument(document, parsed);
}
