import * as path from 'path';
import { CONTENT_DIR } from '../../../../shared/constants';

export function buildExploreFileLabel(filePath: string, projectDir?: string): string {
  if (!projectDir) {
    return filePath;
  }

  const contentRoot = path.join(projectDir, CONTENT_DIR);
  const relativeToContent = path.relative(contentRoot, filePath);
  if (relativeToContent.length > 0 && !relativeToContent.startsWith('..') && !path.isAbsolute(relativeToContent)) {
    return relativeToContent.split(path.sep).join('/');
  }

  return path.relative(projectDir, filePath).split(path.sep).join('/');
}
