export type StegoCommentStatus = 'open' | 'resolved';

export type StegoCommentAnchorType = 'paragraph' | 'file';

export type StegoCommentThread = {
  id: string;
  status: StegoCommentStatus;
  anchor: StegoCommentAnchorType;
  paragraphIndex?: number;
  signature?: string;
  excerpt?: string;
  excerptStartLine?: number;
  excerptStartCol?: number;
  excerptEndLine?: number;
  excerptEndCol?: number;
  thread: string[];
};

export type ParsedCommentAppendix = {
  contentWithoutComments: string;
  comments: StegoCommentThread[];
  errors: string[];
};
