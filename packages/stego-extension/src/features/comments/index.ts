export { CommentDecorationsService } from './commentDecorations';
export { CommentExcerptTracker } from './commentExcerptTracker';
export { isCommentIdentifier, normalizeCommentIdentifier } from './commentIds';
export {
  clearCachedCommentState,
  addCommentAtSelection,
  buildSidebarCommentsState,
  refreshCommentState,
  readCommentStateForFile,
  getDocumentContentWithoutComments,
  replyToComment,
  toggleCommentResolved,
  clearResolvedComments,
  deleteComment,
  jumpToComment,
  persistExcerptUpdates,
  normalizeAuthor,
  stripStegoCommentsAppendix
} from './commentStore';
