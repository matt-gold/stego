import * as vscode from 'vscode';
import { STRINGS } from '../../shared/strings';
import { errorToMessage } from '../../shared/errors';
import { MetadataCliClient } from './metadataCliClient';
import {
  formatMetadataValue,
  isValidMetadataKey,
  parseMarkdownDocument,
  parseMetadataInput,
  serializeMarkdownDocument
} from './frontmatterParse';
import {
  parseImageOverrideInput,
  readImageOverride,
  setImageOverride,
  formatImageStyleSummary
} from './imageMetadata';
import { resolveAllowedStatuses } from './statusControl';
import type { ImageStyle } from '../../shared/types';

const metadataCli = new MetadataCliClient();

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
  const changed = document.getText() !== nextText;
  if (!changed) {
    return false;
  }

  if (document.isDirty) {
    try {
      await document.save();
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not save document before metadata update: ${errorToMessage(error)}`);
      return false;
    }
  }

  const applied = await metadataCli.apply(document.uri.fsPath, {
    hasFrontmatter: parsed.hasFrontmatter || Object.keys(parsed.frontmatter).length > 0,
    frontmatter: parsed.frontmatter,
    body: parsed.body
  });
  if ('warning' in applied) {
    return false;
  }

  try {
    await document.save();
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not auto-save metadata changes: ${errorToMessage(error)}`);
  }

  return applied.changed;
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

type ImageOverrideAction = 'layout' | 'align' | 'width' | 'height' | 'advanced' | 'done' | 'clear';

const IMAGE_WIDTH_PRESETS = ['25%', '33%', '50%', '60%', '66%', '75%', '80%', '90%', '100%'] as const;
const IMAGE_HEIGHT_PRESETS = ['25%', '33%', '50%', '60%', '66%', '75%', '80%', '90%', '100%'] as const;

function cloneImageStyle(style: ImageStyle | undefined): ImageStyle {
  return {
    width: style?.width,
    height: style?.height,
    id: style?.id,
    classes: style?.classes ? [...style.classes] : undefined,
    attrs: style?.attrs ? { ...style.attrs } : undefined,
    layout: style?.layout,
    align: style?.align
  };
}

function isImageStyleEmpty(style: ImageStyle): boolean {
  return !style.width
    && !style.height
    && !style.id
    && !style.layout
    && !style.align
    && (!style.classes || style.classes.length === 0)
    && (!style.attrs || Object.keys(style.attrs).length === 0);
}

async function promptImageLayout(current: ImageStyle): Promise<'block' | 'inline' | undefined | null> {
  const choice = await vscode.window.showQuickPick<
    vscode.QuickPickItem & { value: 'unset' | 'block' | 'inline' }
  >(
    [
      {
        label: 'Inherit / Unset',
        description: 'Use project/default layout',
        value: 'unset'
      },
      {
        label: 'Block',
        description: 'Block layout',
        value: 'block'
      },
      {
        label: 'Inline',
        description: 'Inline layout',
        value: 'inline'
      }
    ],
    {
      title: 'Image Layout',
      placeHolder: `Current: ${current.layout ?? 'inherit'}`
    }
  );

  if (!choice) {
    return null;
  }

  if (choice.value === 'unset') {
    return undefined;
  }
  return choice.value;
}

async function promptImageAlign(current: ImageStyle): Promise<'left' | 'center' | 'right' | undefined | null> {
  const choice = await vscode.window.showQuickPick<
    vscode.QuickPickItem & { value: 'unset' | 'left' | 'center' | 'right' }
  >(
    [
      {
        label: 'Inherit / Unset',
        description: 'Use project/default alignment',
        value: 'unset'
      },
      {
        label: 'Left',
        description: 'Align left',
        value: 'left'
      },
      {
        label: 'Center',
        description: 'Align center',
        value: 'center'
      },
      {
        label: 'Right',
        description: 'Align right',
        value: 'right'
      }
    ],
    {
      title: 'Image Alignment',
      placeHolder: `Current: ${current.align ?? 'inherit'}`
    }
  );

  if (!choice) {
    return null;
  }

  if (choice.value === 'unset') {
    return undefined;
  }
  return choice.value;
}

async function promptImageDimension(
  field: 'width' | 'height',
  currentValue: string | undefined,
  presets: readonly string[]
): Promise<string | undefined | null> {
  const choice = await vscode.window.showQuickPick<
    vscode.QuickPickItem & { value: string }
  >(
    [
      {
        label: 'Inherit / Unset',
        description: 'Remove explicit value',
        value: '__unset__'
      },
      ...presets.map((preset) => ({
        label: preset,
        description: `Set ${field} to ${preset}`,
        value: preset
      })),
      {
        label: 'Custom…',
        description: `Type your own ${field} value`,
        value: '__custom__'
      }
    ],
    {
      title: `Image ${field === 'width' ? 'Width' : 'Height'}`,
      placeHolder: `Current: ${currentValue ?? 'inherit'}`
    }
  );

  if (!choice) {
    return null;
  }

  if (choice.value === '__unset__') {
    return undefined;
  }

  if (choice.value !== '__custom__') {
    return choice.value;
  }

  const custom = await vscode.window.showInputBox({
    prompt: `Custom ${field} value (examples: 50%, 480px, 8in). Leave blank to unset.`,
    value: currentValue ?? ''
  });

  if (custom === undefined) {
    return null;
  }

  const trimmed = custom.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function promptAdvancedImageOverrideInput(current: ImageStyle): Promise<ImageStyle | null> {
  const edited = await vscode.window.showInputBox({
    prompt: 'Advanced image format object (YAML/JSON). Leave blank to reset.',
    value: JSON.stringify(current),
    placeHolder: '{"width":"100%","layout":"inline","align":"left","classes":["diagram"]}'
  });

  if (edited === undefined) {
    return null;
  }

  const trimmed = edited.trim();
  if (!trimmed) {
    return {};
  }

  const parsedInput = parseMetadataInput(trimmed);
  const override = parseImageOverrideInput(parsedInput);
  if (!override) {
    void vscode.window.showWarningMessage(
      'Image format must be an object with one or more keys: width, height, classes, id, attrs, layout, align.'
    );
    return null;
  }

  return override;
}

export async function promptAndEditImageOverride(imageKey: string): Promise<void> {
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

  const draft = cloneImageStyle(readImageOverride(parsed.frontmatter, imageKey));

  while (true) {
    const action = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { value: ImageOverrideAction }
    >(
      [
        {
          label: 'Layout',
          description: draft.layout ?? 'inherit',
          value: 'layout'
        },
        {
          label: 'Align',
          description: draft.align ?? 'inherit',
          value: 'align'
        },
        {
          label: 'Width',
          description: draft.width ?? 'inherit',
          value: 'width'
        },
        {
          label: 'Height',
          description: draft.height ?? 'inherit',
          value: 'height'
        },
        {
          label: 'Advanced',
          description: 'Edit full format object (classes/id/attrs/etc.)',
          value: 'advanced'
        },
        {
          label: 'Save',
          description: isImageStyleEmpty(draft) ? 'Using defaults (will reset)' : formatImageStyleSummary(draft),
          value: 'done'
        },
        {
          label: 'Reset',
          description: 'Reset this image to project defaults',
          value: 'clear'
        }
      ],
      {
        title: `Edit Image Format: ${imageKey}`,
        placeHolder: 'Choose a field to edit'
      }
    );

    if (!action) {
      return;
    }

    if (action.value === 'done') {
      setImageOverride(parsed.frontmatter, imageKey, isImageStyleEmpty(draft) ? undefined : draft);
      await writeParsedDocument(document, parsed);
      if (isImageStyleEmpty(draft)) {
        void vscode.window.showInformationMessage(`Reset image format for '${imageKey}'.`);
      } else {
        void vscode.window.showInformationMessage(`Saved image format for '${imageKey}' (${formatImageStyleSummary(draft)}).`);
      }
      return;
    }

    if (action.value === 'clear') {
      setImageOverride(parsed.frontmatter, imageKey, undefined);
      await writeParsedDocument(document, parsed);
      void vscode.window.showInformationMessage(`Reset image format for '${imageKey}'.`);
      return;
    }

    if (action.value === 'layout') {
      const selected = await promptImageLayout(draft);
      if (selected === null) {
        continue;
      }
      draft.layout = selected;
      continue;
    }

    if (action.value === 'align') {
      const selected = await promptImageAlign(draft);
      if (selected === null) {
        continue;
      }
      draft.align = selected;
      continue;
    }

    if (action.value === 'width') {
      const selected = await promptImageDimension('width', draft.width, IMAGE_WIDTH_PRESETS);
      if (selected === null) {
        continue;
      }
      draft.width = selected;
      continue;
    }

    if (action.value === 'height') {
      const selected = await promptImageDimension('height', draft.height, IMAGE_HEIGHT_PRESETS);
      if (selected === null) {
        continue;
      }
      draft.height = selected;
      continue;
    }

    if (action.value === 'advanced') {
      const selected = await promptAdvancedImageOverrideInput(draft);
      if (selected === null) {
        continue;
      }
      const cloned = cloneImageStyle(selected);
      draft.width = cloned.width;
      draft.height = cloned.height;
      draft.id = cloned.id;
      draft.classes = cloned.classes;
      draft.attrs = cloned.attrs;
      draft.layout = cloned.layout;
      draft.align = cloned.align;
      continue;
    }
  }
}

export async function clearImageOverride(imageKey: string): Promise<void> {
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

  setImageOverride(parsed.frontmatter, imageKey, undefined);
  await writeParsedDocument(document, parsed);
}

type RequiredMetadataPromptResult =
  | { kind: 'value'; value: string }
  | { kind: 'skip' };

type MetadataQuickPickItem = vscode.QuickPickItem & {
  metaType: 'suggestion' | 'skip';
};

export async function promptAndFillRequiredMetadata(requiredKeys: string[]): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  if (requiredKeys.length === 0) {
    void vscode.window.showInformationMessage('No required metadata keys are configured for this project.');
    return;
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const missingKeys = requiredKeys.filter((key) => isUnsetRequiredMetadataValue(parsed.frontmatter[key]));
  if (missingKeys.length === 0) {
    void vscode.window.showInformationMessage('All required metadata fields are already set.');
    return;
  }

  const allowedStatuses = await resolveAllowedStatuses(document);
  let filledCount = 0;
  let skippedCount = 0;
  let cancelled = false;

  for (let index = 0; index < missingKeys.length; index += 1) {
    const key = missingKeys[index];
    const suggestions = key.toLowerCase() === 'status' ? allowedStatuses : [];
    const result = await promptRequiredMetadataValue(key, suggestions, index + 1, missingKeys.length);
    if (!result) {
      cancelled = true;
      break;
    }

    if (result.kind === 'skip') {
      skippedCount += 1;
      continue;
    }

    parsed.frontmatter[key] = parseMetadataInput(result.value);
    filledCount += 1;
  }

  if (filledCount > 0) {
    await writeParsedDocument(document, parsed);
  }

  const summary = [
    `Filled ${filledCount} required metadata field${filledCount === 1 ? '' : 's'}.`,
    skippedCount > 0 ? `Skipped ${skippedCount}.` : '',
    cancelled ? 'Cancelled before completing all missing fields.' : ''
  ]
    .filter((line) => line.length > 0)
    .join(' ');
  void vscode.window.showInformationMessage(summary);
}

async function promptRequiredMetadataValue(
  key: string,
  suggestions: string[],
  step: number,
  total: number
): Promise<RequiredMetadataPromptResult | undefined> {
  return new Promise<RequiredMetadataPromptResult | undefined>((resolve) => {
    const quickPick = vscode.window.createQuickPick<MetadataQuickPickItem>();
    quickPick.title = `Fill Required Metadata (${step}/${total})`;
    quickPick.placeholder = `Set value for '${key}' (type a value, choose a suggestion, or select Skip this field)`;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    const suggestionItems: MetadataQuickPickItem[] = suggestions.map((value) => ({
      label: value,
      description: `Use '${value}'`,
      detail: `Set '${key}' to '${value}'`,
      metaType: 'suggestion'
    }));
    const skipItem: MetadataQuickPickItem = {
      label: 'Skip this field',
      description: `Leave '${key}' unset for now`,
      metaType: 'skip'
    };
    quickPick.items = [...suggestionItems, skipItem];

    let settled = false;
    const finish = (value: RequiredMetadataPromptResult | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
      quickPick.hide();
      quickPick.dispose();
    };

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected?.metaType === 'skip') {
        finish({ kind: 'skip' });
        return;
      }

      const rawValue = selected?.metaType === 'suggestion'
        ? selected.label
        : quickPick.value;
      const trimmed = rawValue.trim();
      if (!trimmed) {
        void vscode.window.showWarningMessage(`Enter a value for '${key}' or select "Skip this field".`);
        return;
      }

      finish({ kind: 'value', value: trimmed });
    });

    quickPick.onDidHide(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
        quickPick.dispose();
      }
    });

    quickPick.show();
  });
}

function isUnsetRequiredMetadataValue(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim().length === 0;
}
