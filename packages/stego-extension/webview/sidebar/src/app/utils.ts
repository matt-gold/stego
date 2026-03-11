
const identifierPatternSource = '\\b[A-Z][A-Z0-9]*-[A-Z0-9]+(?:-[A-Z0-9]+)*\\b';

export function linkifyExplorerIdentifiers(container: HTMLElement): void {
  const skipTags = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'BUTTON']);

  const shouldSkipNode = (textNode: Text): boolean => {
    const textValue = textNode.nodeValue || '';
    if (!textValue.trim()) {
      return true;
    }

    let current = textNode.parentElement;
    while (current && current !== container) {
      if (skipTags.has(current.tagName)) {
        return true;
      }
      current = current.parentElement;
    }

    return false;
  };

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let nextNode = walker.nextNode();
  while (nextNode) {
    if (nextNode instanceof Text) {
      textNodes.push(nextNode);
    }
    nextNode = walker.nextNode();
  }

  for (const textNode of textNodes) {
    if (shouldSkipNode(textNode)) {
      continue;
    }

    const textValue = textNode.nodeValue || '';
    const identifierRegex = new RegExp(identifierPatternSource, 'g');
    if (!identifierRegex.test(textValue)) {
      continue;
    }

    identifierRegex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match = identifierRegex.exec(textValue);

    while (match) {
      const matchIndex = match.index;
      const identifier = match[0];
      if (matchIndex > lastIndex) {
        fragment.append(document.createTextNode(textValue.slice(lastIndex, matchIndex)));
      }

      const identifierLink = document.createElement('button');
      identifierLink.type = 'button';
      identifierLink.className = 'id-link md-id-link';
      identifierLink.dataset.identifierId = identifier.toUpperCase();
      identifierLink.textContent = identifier;
      fragment.append(identifierLink);

      lastIndex = identifierRegex.lastIndex;
      match = identifierRegex.exec(textValue);
    }

    if (lastIndex < textValue.length) {
      fragment.append(document.createTextNode(textValue.slice(lastIndex)));
    }

    textNode.replaceWith(fragment);
  }
}