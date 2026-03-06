export {
  collectIdentifierOccurrencesFromLines,
  extractIdentifierTokensFromValue,
  tryParseIdentifierFromHeading,
  getIdentifierPrefix,
  compileGlobalRegex
} from './identifierExtraction';
export { collectIdentifiers } from './collectIdentifiers';
export { createDocumentLinkProvider } from './documentLinks';
export { createHoverProvider } from './hover';
