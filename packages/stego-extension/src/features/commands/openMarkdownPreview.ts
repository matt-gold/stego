import { getActiveMarkdownDocument } from '../metadata/frontmatterEdit';
import { openMarkdownPreviewForActiveDocument } from '../navigation/openTargets';

export async function openMarkdownPreviewCommand(): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  await openMarkdownPreviewForActiveDocument(document);
}
