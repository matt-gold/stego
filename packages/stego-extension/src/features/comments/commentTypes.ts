export type StegoCommentStatus = 'open' | 'resolved';

export type StegoCommentThread = {
  id: string;
  status: StegoCommentStatus;
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

export type StegoCommentAnchor = {
  anchorType: 'paragraph' | 'file';
  line: number;
  degraded: boolean;
  underlineStartLine?: number;
  underlineStartCol?: number;
  underlineEndLine?: number;
  underlineEndCol?: number;
  paragraphEndLine?: number;
};

export type StegoCommentDocumentState = {
  contentWithoutComments: string;
  comments: StegoCommentThread[];
  parseErrors: string[];
  anchorsById: Record<string, StegoCommentAnchor>;
  totalCount: number;
  unresolvedCount: number;
};
