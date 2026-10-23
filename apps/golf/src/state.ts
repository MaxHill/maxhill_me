type State =
  | {
    status: "initial";
  }
  | {
    status: "tenant-selection";
    user: User | null;
  }
  | {
    status: "authenticated-ready";
    user: User;
    tenant: Tenant;
    db: DatabaseState;
  }
  | {
    status: "anonymous-ready";
    db: DatabaseState;
  };

type DatabaseState =
  | { status: "bootstraping" }
  | {
    status: "ready";
    sync: "active" | "stoped";
    handle: IDBDatabase;
  }
  | {
    status: "resetting";
  };

type Events =
  | { type: "bootstrap_auth" }
  | { type: "select_tenant"; tenantId: string }
  | { type: "open_database"; tenantId: string | null }
  | { type: "reset_database" };
