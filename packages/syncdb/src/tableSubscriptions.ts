export type ChangeSource = "local" | "remote";

/** Filter for subscribe: include local writes, remote applies, or both. */
export type SourceFilter = "all" | ChangeSource;

export interface TableChangeEvent {
  table: string;
  source: ChangeSource;
}

export type SubscriptionCallbackHandler = (event: TableChangeEvent) => void;

type Subscription = {
  handler: SubscriptionCallbackHandler;
  source: SourceFilter;
};

function sourceMatches(filter: SourceFilter, source: ChangeSource): boolean {
  return filter === "all" || filter === source;
}

function eventKey(event: TableChangeEvent): string {
  return `${event.table}:${event.source}`;
}

export class TableSubscriptions {
  /** @internal table name → subscriptions */
  subscriptions: Map<string, Subscription[]> = new Map();

  private databaseSubscriptions: Subscription[] = [];

  /** Deduped pending events for the next microtask flush. */
  private pendingNotifications = new Map<string, TableChangeEvent>();
  private notificationScheduled = false;

  subscribe(
    table: string,
    handler: SubscriptionCallbackHandler,
    source: SourceFilter = "all",
  ): () => void {
    let handlers = this.subscriptions.get(table);
    if (!handlers) {
      handlers = [];
      this.subscriptions.set(table, handlers);
    }

    if (handlers.some((entry) => entry.handler === handler)) {
      console.warn(`Handler already subscribed to table "${table}"`);
    } else {
      handlers.push({ handler, source });
    }

    return () => {
      const list = this.subscriptions.get(table);
      if (!list) {
        return;
      }
      const index = list.findIndex((entry) => entry.handler === handler);
      if (index !== -1) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        this.subscriptions.delete(table);
      }
    };
  }

  /**
   * Database-wide subscribe. Fires for every table notification whose source
   * matches the filter (default `"all"`).
   */
  subscribeDatabase(
    handler: SubscriptionCallbackHandler,
    source: SourceFilter = "all",
  ): () => void {
    if (this.databaseSubscriptions.some((entry) => entry.handler === handler)) {
      console.warn("Handler already subscribed at database level");
    } else {
      this.databaseSubscriptions.push({ handler, source });
    }

    return () => {
      const index = this.databaseSubscriptions.findIndex(
        (entry) => entry.handler === handler,
      );
      if (index !== -1) {
        this.databaseSubscriptions.splice(index, 1);
      }
    };
  }

  notify(table: string, source: ChangeSource): void {
    const event: TableChangeEvent = { table, source };
    this.pendingNotifications.set(eventKey(event), event);
    if (!this.notificationScheduled) {
      this.notificationScheduled = true;
      queueMicrotask(() => this.flushNotifications());
    }
  }

  private flushNotifications(): void {
    this.notificationScheduled = false;

    const events = [...this.pendingNotifications.values()];
    this.pendingNotifications.clear();

    for (const event of events) {
      const tableHandlers = this.subscriptions.get(event.table);
      if (tableHandlers) {
        for (const entry of [...tableHandlers]) {
          if (!sourceMatches(entry.source, event.source)) {
            continue;
          }
          try {
            entry.handler(event);
          } catch (error) {
            console.error(error);
          }
        }
      }

      for (const entry of [...this.databaseSubscriptions]) {
        if (!sourceMatches(entry.source, event.source)) {
          continue;
        }
        try {
          entry.handler(event);
        } catch (error) {
          console.error(error);
        }
      }
    }
  }
}
