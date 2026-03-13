export type SidebarEventMiddleware<TEvent> = (
  event: TEvent,
  next: (event: TEvent) => void
) => void;

export type SidebarEventSubscriber<TEvent> = (event: TEvent) => void;

export class SidebarEventBus<TEvent> {
  private readonly middleware: SidebarEventMiddleware<TEvent>[];
  private readonly subscribers = new Set<SidebarEventSubscriber<TEvent>>();

  constructor(middleware: SidebarEventMiddleware<TEvent>[] = []) {
    this.middleware = [...middleware];
  }

  public subscribe(subscriber: SidebarEventSubscriber<TEvent>): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  public publish(event: TEvent): void {
    let index = -1;
    const run = (nextEvent: TEvent): void => {
      index += 1;
      if (index < this.middleware.length) {
        this.middleware[index](nextEvent, run);
        return;
      }

      for (const subscriber of this.subscribers) {
        subscriber(nextEvent);
      }
    };

    run(event);
  }
}
