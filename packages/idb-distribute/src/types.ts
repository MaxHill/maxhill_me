export interface WALEntry {
  key: IDBValidKey;
  table: string;
  operation: "put" | "del" | "clear";
  value: IDBKeyRange | IDBValidKey | any; // value to write if put or key/keyRange to delete
  valueKey?: IDBValidKey;
  version: number;
  clientId: string;
  readonly serverVersion?: number; // Only set on the server
}

export interface SyncRequest {
  clientId: string;
  entries: WALEntry[];
  clientLastSeenVersion: number;
  requestHash: string; // sha-256 hash of the request, the request should be rehashed and compared to this to ensure integrity on the server
}

export interface SyncResponse {
  fromServerVersion: number; // Used to determine if the response is ok to apply. Can be removed when crdt is implemented
  responseHash: string; // sha-256 hash of the response, the response should be rehashed and compared to this to ensure integrity
  entries: WALEntry[];
}
