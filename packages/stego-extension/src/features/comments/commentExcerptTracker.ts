import type { StegoCommentThread } from './commentTypes';

/**
 * Position using 0-based line and 0-based character (VS Code convention).
 */
export type Pos = { line: number; character: number };

export type TrackedComment = {
  id: string;
  paragraphIndex?: number;
  start: Pos;
  end: Pos;
  originalStart: Pos;
  originalEnd: Pos;
  deleted: boolean;
  dirty: boolean;
};

/**
 * Minimal representation of a text change event, matching the shape of
 * VS Code's TextDocumentContentChangeEvent (range-based variant).
 */
export type ContentChange = {
  range: { start: Pos; end: Pos };
  text: string;
};

export class CommentExcerptTracker {
  private readonly tracked = new Map<string, TrackedComment[]>();

  /**
   * Initialize or replace tracking state for a document from its parsed comments.
   * Only comments with full excerpt coordinates are tracked.
   * Comment coordinates are 1-based lines / 0-based columns; we convert to 0-based lines internally.
   */
  public load(uri: string, comments: StegoCommentThread[]): void {
    const entries: TrackedComment[] = [];
    for (const comment of comments) {
      if (
        comment.excerptStartLine === undefined ||
        comment.excerptStartCol === undefined ||
        comment.excerptEndLine === undefined ||
        comment.excerptEndCol === undefined
      ) {
        continue;
      }

      if (!hasValidRange(comment.excerptStartLine, comment.excerptStartCol, comment.excerptEndLine, comment.excerptEndCol)) {
        continue;
      }

      const start: Pos = { line: comment.excerptStartLine - 1, character: comment.excerptStartCol };
      const end: Pos = { line: comment.excerptEndLine - 1, character: comment.excerptEndCol };
      entries.push({
        id: comment.id,
        paragraphIndex: comment.paragraphIndex,
        start: { ...start },
        end: { ...end },
        originalStart: { ...start },
        originalEnd: { ...end },
        deleted: false,
        dirty: false
      });
    }

    this.tracked.set(uri, entries);
  }

  /**
   * Apply document content changes to all tracked ranges for a document.
   * Changes should be provided exactly as received from VS Code (they may
   * arrive in any order; we sort bottom-to-top internally).
   */
  public applyChanges(uri: string, contentChanges: readonly ContentChange[]): void {
    const entries = this.tracked.get(uri);
    if (!entries || entries.length === 0 || contentChanges.length === 0) {
      return;
    }

    // Sort changes from bottom-to-top so earlier adjustments don't affect later ones
    const sorted = [...contentChanges].sort((a, b) => {
      const lineDiff = b.range.start.line - a.range.start.line;
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return b.range.start.character - a.range.start.character;
    });

    for (const change of sorted) {
      for (const entry of entries) {
        if (entry.deleted) {
          continue;
        }
        applyChangeToEntry(entry, change);
      }
    }
  }

  public getTracked(uri: string): TrackedComment[] | undefined {
    return this.tracked.get(uri);
  }

  public getDeletedIds(uri: string): string[] {
    const entries = this.tracked.get(uri);
    if (!entries) {
      return [];
    }
    return entries.filter((e) => e.deleted).map((e) => e.id);
  }

  /**
   * Returns IDs of deleted comments plus the IDs of all comments sharing
   * the same paragraphIndex (thread siblings).
   */
  public getDeletedThreadIds(uri: string, allComments: StegoCommentThread[]): string[] {
    const deletedIds = this.getDeletedIds(uri);
    if (deletedIds.length === 0) {
      return [];
    }

    const deletedEntries = this.tracked.get(uri)?.filter((e) => e.deleted) ?? [];
    const deletedParagraphIndexes = new Set<number>();
    for (const entry of deletedEntries) {
      if (entry.paragraphIndex !== undefined) {
        deletedParagraphIndexes.add(entry.paragraphIndex);
      }
    }

    const result = new Set(deletedIds);
    if (deletedParagraphIndexes.size > 0) {
      for (const comment of allComments) {
        if (comment.paragraphIndex !== undefined && deletedParagraphIndexes.has(comment.paragraphIndex)) {
          result.add(comment.id);
        }
      }
    }

    return [...result];
  }

  public hasPendingChanges(uri: string): boolean {
    const entries = this.tracked.get(uri);
    if (!entries) {
      return false;
    }
    return entries.some((e) => e.dirty || e.deleted);
  }

  public clear(uri: string): void {
    this.tracked.delete(uri);
  }

  public clearAll(): void {
    this.tracked.clear();
  }
}

function hasValidRange(startLine: number, startCol: number, endLine: number, endCol: number): boolean {
  return startLine < endLine || (startLine === endLine && startCol < endCol);
}

function posIsBefore(a: Pos, b: Pos): boolean {
  return a.line < b.line || (a.line === b.line && a.character < b.character);
}

function posIsBeforeOrEqual(a: Pos, b: Pos): boolean {
  return a.line < b.line || (a.line === b.line && a.character <= b.character);
}

function posEquals(a: Pos, b: Pos): boolean {
  return a.line === b.line && a.character === b.character;
}

/**
 * Compute the end position after inserting `text` starting at `start`.
 */
function computeInsertEnd(start: Pos, text: string): Pos {
  const lines = text.split('\n');
  if (lines.length === 1) {
    return { line: start.line, character: start.character + lines[0].length };
  }
  return { line: start.line + lines.length - 1, character: lines[lines.length - 1].length };
}

/**
 * Shift a position that is known to be after a change's replaced range.
 * `changeStart` / `changeEnd` are the range that was replaced,
 * `insertEnd` is where the replacement text ends.
 */
function shiftPosition(pos: Pos, changeEnd: Pos, insertEnd: Pos): Pos {
  const lineDelta = insertEnd.line - changeEnd.line;

  if (pos.line > changeEnd.line) {
    return { line: pos.line + lineDelta, character: pos.character };
  }

  // pos.line === changeEnd.line
  const charDelta = insertEnd.character - changeEnd.character;
  return { line: pos.line + lineDelta, character: pos.character + charDelta };
}

function applyChangeToEntry(entry: TrackedComment, change: ContentChange): void {
  const cStart = change.range.start;
  const cEnd = change.range.end;
  const insertEnd = computeInsertEnd(cStart, change.text);

  // Change is entirely after the excerpt — no effect
  if (posIsBeforeOrEqual(entry.end, cStart)) {
    return;
  }

  // Change is entirely before the excerpt — shift both endpoints
  if (posIsBeforeOrEqual(cEnd, entry.start)) {
    entry.start = shiftPosition(entry.start, cEnd, insertEnd);
    entry.end = shiftPosition(entry.end, cEnd, insertEnd);
    entry.dirty = true;
    return;
  }

  // Change completely contains the excerpt
  if (posIsBeforeOrEqual(cStart, entry.start) && posIsBeforeOrEqual(entry.end, cEnd)) {
    // If replacement is empty or only whitespace, mark deleted
    if (change.text.trim().length === 0) {
      entry.deleted = true;
      entry.dirty = true;
      return;
    }

    // Replacement has content — collapse excerpt to the insertion point
    entry.start = { ...cStart };
    entry.end = { ...insertEnd };
    entry.dirty = true;
    return;
  }

  // Change overlaps the start of the excerpt (change starts before, ends inside)
  if (posIsBefore(cStart, entry.start) && posIsBefore(cEnd, entry.end)) {
    // Anchor the excerpt start to the insert end (the new text absorbs the overlap)
    entry.start = { ...insertEnd };
    entry.end = shiftPosition(entry.end, cEnd, insertEnd);
    entry.dirty = true;
    return;
  }

  // Change overlaps the end of the excerpt (change starts inside, ends after)
  if (posIsBefore(entry.start, cStart) && posIsBefore(entry.end, cEnd)) {
    entry.end = { ...insertEnd };
    entry.dirty = true;
    return;
  }

  // Change is entirely inside the excerpt
  if (posIsBeforeOrEqual(entry.start, cStart) && posIsBeforeOrEqual(cEnd, entry.end)) {
    entry.end = shiftPosition(entry.end, cEnd, insertEnd);
    entry.dirty = true;
    return;
  }
}

// Exported for testing
export { applyChangeToEntry, computeInsertEnd, shiftPosition, posIsBefore, posIsBeforeOrEqual };
