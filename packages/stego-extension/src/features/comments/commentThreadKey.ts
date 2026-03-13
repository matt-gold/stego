import { getCommentThreadKey as getSharedCommentThreadKey } from '@stego/shared/domain/comments';
import type { StegoCommentThread } from './commentTypes';

export function getCommentThreadKey(comment: StegoCommentThread): string {
  return getSharedCommentThreadKey(comment);
}
