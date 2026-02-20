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

export type ParsedCommentAppendix = {
  contentWithoutComments: string;
  comments: StegoCommentThread[];
  errors: string[];
};
