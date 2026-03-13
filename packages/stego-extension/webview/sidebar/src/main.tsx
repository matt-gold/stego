import { render } from 'solid-js/web';
import type { SidebarWebviewState } from '@sidebar-protocol';
import { App } from './app/App';
import { parseSidebarHostMessage, postReadyMessage } from './bridge/protocol';
import { updateSidebarState } from './app/store';
import './styles/sidebar.css';

function bootstrap(): void {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = parseSidebarHostMessage(event.data);
    if (!message) {
      return;
    }

    updateSidebarState(message.state as SidebarWebviewState);
  });

  const root = document.getElementById('app');
  if (!root) {
    return;
  }

  render(() => <App />, root);
  postReadyMessage();
}

bootstrap();
