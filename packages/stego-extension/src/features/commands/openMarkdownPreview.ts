import { getActiveMarkdownDocument } from '../metadata';
import { openMarkdownPreviewForActiveDocument } from '../navigation';

export async function openMarkdownPreviewCommand(): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  await openMarkdownPreviewForActiveDocument(document);
}
