export declare const START_SENTINEL = "<!-- stego-comments:start -->";
export declare const END_SENTINEL = "<!-- stego-comments:end -->";
export type CommentStatus = "open" | "resolved";
export type CommentRange = {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
};
export type CommentThread = {
    id: string;
    status: CommentStatus;
    createdAt?: string;
    timezone?: string;
    timezoneOffsetMinutes?: number;
    paragraphIndex?: number;
    excerpt?: string;
    excerptStartLine?: number;
    excerptStartCol?: number;
    excerptEndLine?: number;
    excerptEndCol?: number;
    thread: string[];
};
export type ParagraphInfo = {
    index: number;
    startLine: number;
    endLine: number;
    text: string;
};
export type CommentAnchor = {
    anchorType: "paragraph" | "file";
    line: number;
    degraded: boolean;
    underlineStartLine?: number;
    underlineStartCol?: number;
    underlineEndLine?: number;
    underlineEndCol?: number;
    paragraphEndLine?: number;
};
export type ParsedCommentAppendix = {
    contentWithoutComments: string;
    comments: CommentThread[];
    errors: string[];
};
export type LoadedCommentDocumentState = {
    lineEnding: string;
    contentWithoutComments: string;
    comments: CommentThread[];
    errors: string[];
    paragraphs: ParagraphInfo[];
    anchorsById: Map<string, CommentAnchor>;
};
export type SerializedCommentDocumentState = {
    contentWithoutComments: string;
    comments: CommentThread[];
    parseErrors: string[];
    anchorsById: Record<string, CommentAnchor>;
    totalCount: number;
    unresolvedCount: number;
};
export type AddCommentAnchorInput = {
    range?: CommentRange;
    cursorLine?: number;
    excerpt?: string;
};
export type AddCommentInput = {
    message: string;
    author?: string;
    anchor?: AddCommentAnchorInput;
    meta?: Record<string, unknown>;
};
export type ReplyCommentInput = {
    commentId: string;
    message: string;
    author?: string;
};
export type SetStatusInput = {
    commentId: string;
    status: CommentStatus;
    thread?: boolean;
};
export type SyncAnchorUpdate = {
    id: string;
    start: {
        line: number;
        col: number;
    };
    end: {
        line: number;
        col: number;
    };
};
export type SyncAnchorsInput = {
    updates?: SyncAnchorUpdate[];
    deleteIds?: string[];
};
export type AddCommentResult = {
    commentId: string;
    comments: CommentThread[];
};
export type ReplyCommentResult = {
    commentId: string;
    comments: CommentThread[];
};
export type SetStatusResult = {
    changedIds: string[];
    comments: CommentThread[];
};
export type DeleteCommentResult = {
    removed: number;
    comments: CommentThread[];
};
export type ClearResolvedResult = {
    removed: number;
    comments: CommentThread[];
};
export type SyncAnchorsResult = {
    updatedCount: number;
    deletedCount: number;
    comments: CommentThread[];
};
export declare function parseCommentAppendix(markdown: string): ParsedCommentAppendix;
export declare function serializeCommentAppendix(comments: CommentThread[], lineEnding?: string): string;
export declare function upsertCommentAppendix(contentWithoutComments: string, comments: CommentThread[], lineEnding?: string): string;
export declare function loadCommentDocumentState(markdownText: string): LoadedCommentDocumentState;
export declare function serializeLoadedState(state: LoadedCommentDocumentState): SerializedCommentDocumentState;
export declare function ensureNoParseErrors(state: LoadedCommentDocumentState): void;
export declare function addCommentToState(markdownText: string, state: LoadedCommentDocumentState, input: AddCommentInput): AddCommentResult;
export declare function replyToCommentInState(state: LoadedCommentDocumentState, input: ReplyCommentInput): ReplyCommentResult;
export declare function setCommentStatusInState(state: LoadedCommentDocumentState, input: SetStatusInput): SetStatusResult;
export declare function deleteCommentInState(state: LoadedCommentDocumentState, commentId: string): DeleteCommentResult;
export declare function clearResolvedInState(state: LoadedCommentDocumentState): ClearResolvedResult;
export declare function syncAnchorsInState(markdownText: string, state: LoadedCommentDocumentState, input: SyncAnchorsInput): SyncAnchorsResult;
export declare function renderStateDocument(state: LoadedCommentDocumentState, comments: CommentThread[]): string;
export declare function normalizeAuthor(value: string): string;
//# sourceMappingURL=parser.d.ts.map