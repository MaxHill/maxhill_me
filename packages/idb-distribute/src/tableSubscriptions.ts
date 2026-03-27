export interface TableChangeEvent {
  table: string;
}
export type SubscriptionCallbackHandler = (event: TableChangeEvent) => void;
export class TableSubscriptions {
  subscriptions: Map<string, SubscriptionCallbackHandler[]> = new Map();

  private pendingNotifications = new Set<string>();
  private notificationScheduled = false;

  subscribe(table: string, handler: SubscriptionCallbackHandler) {
    let handlers = this.subscriptions.get(table);
    if (!handlers) {
      handlers = [];
      this.subscriptions.set(table, handlers);
    }

    if (handlers.includes(handler)) {
      console.warn(`Handler already subscribed to table "${table}"`);
    } else {
      handlers.push(handler);
    }

    return () => {
      const idx = handlers!.indexOf(handler);
      if (idx !== -1) handlers!.splice(idx, 1);
      if (handlers!.length === 0) this.subscriptions.delete(table);
    };
  }

  notify(table: string) {
    this.pendingNotifications.add(table);
    if (!this.notificationScheduled) {
      this.notificationScheduled = true;
      queueMicrotask(() => this.flushNotifications());
    }
  }

  private flushNotifications() {
    this.notificationScheduled = false;

    for (const table of this.pendingNotifications) {
      const handlers = this.subscriptions.get(table);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler({ table });
          } catch (e) {
            console.error(e);
          }
        }
      }
    }

    this.pendingNotifications.clear();
  }
}
