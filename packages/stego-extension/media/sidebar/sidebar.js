const vscode = acquireVsCodeApi();
const explorerIdentifierPatternSource = document.body.dataset.identifierPattern || '\\b[A-Z][A-Z0-9]*-[A-Z0-9]+(?:-[A-Z0-9]+)*\\b';
const webviewState = vscode.getState() || {};
const explorerLoadToken = Number(document.body.dataset.explorerLoadToken || 0);
const previousExplorerLoadToken = Number(webviewState.lastExplorerLoadToken || 0);
const activeTab = document.body.dataset.activeTab || '';
const selectedCommentId = (document.body.dataset.selectedCommentId || '').trim().toUpperCase();
const didLoadNewExplorer = (
  Number.isFinite(explorerLoadToken)
  && explorerLoadToken > 0
  && explorerLoadToken !== previousExplorerLoadToken
);

const shouldScrollToSelectedComment = (
  activeTab === 'document'
  && selectedCommentId.length > 0
  && (
    selectedCommentId !== (typeof webviewState.lastSelectedCommentId === 'string'
      ? webviewState.lastSelectedCommentId.trim().toUpperCase()
      : '')
    || (webviewState.lastActiveTab && webviewState.lastActiveTab !== 'document')
  )
);

const nextState = {
  ...webviewState,
  lastExplorerLoadToken: explorerLoadToken,
  lastActiveTab: activeTab,
  lastSelectedCommentId: selectedCommentId
};

if (didLoadNewExplorer) {
  // Explorer navigation should always land the user at the top.
  nextState.backlinkFocused = false;
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }, 0);
  });
}

vscode.setState(nextState);

if (shouldScrollToSelectedComment) {
  requestAnimationFrame(() => {
    const selectedComment = selectedCommentId
      ? document.querySelector(`.comment-list-item.selected[data-id="${selectedCommentId}"]`)
      : null;
    if (!(selectedComment instanceof HTMLElement)) {
      return;
    }

    selectedComment.scrollIntoView({ block: 'center', behavior: 'auto' });
  });
}

function linkifyExplorerIdentifiers(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const skipTags = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'BUTTON']);
  const shouldSkipNode = (textNode) => {
    if (!(textNode instanceof Text)) {
      return true;
    }
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
  const textNodes = [];
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
    const identifierRegex = new RegExp(explorerIdentifierPatternSource, 'g');
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
      identifierLink.dataset.action = 'openIdentifier';
      identifierLink.dataset.id = identifier.toUpperCase();
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

for (const markdownContainer of document.querySelectorAll('.md-rendered')) {
  linkifyExplorerIdentifiers(markdownContainer);
}

const backlinkInput = document.getElementById('backlink-filter');
if (backlinkInput) {
  if (typeof webviewState.backlinkValue === 'string' && webviewState.backlinkValue !== backlinkInput.value) {
    backlinkInput.value = webviewState.backlinkValue;
  }

  if (!didLoadNewExplorer && webviewState.backlinkFocused) {
    backlinkInput.focus();
    const start = typeof webviewState.backlinkSelectionStart === 'number'
      ? webviewState.backlinkSelectionStart
      : backlinkInput.value.length;
    const end = typeof webviewState.backlinkSelectionEnd === 'number'
      ? webviewState.backlinkSelectionEnd
      : start;
    try {
      backlinkInput.setSelectionRange(start, end);
    } catch {
      // no-op
    }
  }

  let filterDebounce;
  backlinkInput.addEventListener('input', () => {
    const selectionStart = backlinkInput.selectionStart ?? backlinkInput.value.length;
    const selectionEnd = backlinkInput.selectionEnd ?? selectionStart;
    vscode.setState({
      ...vscode.getState(),
      backlinkValue: backlinkInput.value,
      backlinkFocused: true,
      backlinkSelectionStart: selectionStart,
      backlinkSelectionEnd: selectionEnd
    });

    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      vscode.postMessage({ type: 'setBacklinkFilter', value: backlinkInput.value });
    }, 120);
  });

  backlinkInput.addEventListener('blur', () => {
    vscode.setState({
      ...vscode.getState(),
      backlinkFocused: false
    });
  });
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const link = target.closest('.md-rendered a[href]');
  if (!link) {
    return;
  }

  event.preventDefault();
  const href = link.getAttribute('href');
  if (!href) {
    return;
  }

  const container = link.closest('.md-rendered');
  const basePath = container ? (container.getAttribute('data-base-path') || '') : '';
  vscode.postMessage({
    type: 'openExternalLink',
    url: href,
    basePath
  });
});

for (const actionEl of document.querySelectorAll('[data-action]')) {
  const eventName = actionEl.tagName === 'INPUT' ? 'change' : 'click';
  actionEl.addEventListener(eventName, () => {
    const type = actionEl.dataset.action;
    if (!type) {
      return;
    }

    if (actionEl instanceof HTMLInputElement && (actionEl.type === 'radio' || actionEl.type === 'checkbox') && !actionEl.checked) {
      return;
    }

    const payload = { type };

    if (actionEl.dataset.key) {
      payload.key = actionEl.dataset.key;
    }

    if (actionEl.dataset.id) {
      payload.id = actionEl.dataset.id;
    }

    if (actionEl.dataset.prefix) {
      payload.prefix = actionEl.dataset.prefix;
    }

    if (actionEl.dataset.line) {
      payload.line = Number(actionEl.dataset.line);
    }

    if (actionEl.dataset.filePath) {
      payload.filePath = actionEl.dataset.filePath;
    }

    if (actionEl.dataset.index) {
      payload.index = Number(actionEl.dataset.index);
    }

    if (actionEl.dataset.url) {
      payload.url = actionEl.dataset.url;
    }

    if (actionEl.dataset.basePath) {
      payload.basePath = actionEl.dataset.basePath;
    }

    if (actionEl.dataset.resolveThread) {
      payload.resolveThread = true;
    }

    if (actionEl.dataset.value) {
      payload.value = actionEl.dataset.value;
    } else if (actionEl instanceof HTMLInputElement) {
      payload.value = actionEl.value;
    }

    vscode.postMessage(payload);
  });
}
