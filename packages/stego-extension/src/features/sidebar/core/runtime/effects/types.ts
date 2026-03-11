export type SidebarRuntimeEffect =
  | { type: 'notification.warning'; message: string }
  | { type: 'notification.info'; message: string };
