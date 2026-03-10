import { applyOperationToRow, CRDTOperation, Dot, ValidKey } from "./crdt";
import { CRDTDatabase } from "./crdtDatabase";
import { CLIENT_STATE_STORE, IDBRepository, OPERATIONS_STORE, ROWS_STORE } from "./IDBRepository";
import { Index } from "./indexes";
import { PersistedLogicalClock } from "./persistedLogicalClock";

export class Table {
    private tableName: string;
    private indexes: Map<string, string[]>;

    // TODO: Not a nice approach to pass all of this from CrdtDatabase
    // we should refactor this somehow
    private idbRepository: IDBRepository;
    private crdtDatabase: CRDTDatabase;
    private logicalClock: PersistedLogicalClock;

    constructor(
        tableName: string,
        indexes: Map<string, string[]>,
        idbRepository: IDBRepository,
        crdtDatabase: CRDTDatabase,
        logicalClock: PersistedLogicalClock,
    ) {
        this.tableName = tableName;
        this.indexes = indexes;
        this.idbRepository = idbRepository;
        this.crdtDatabase = crdtDatabase;
        this.logicalClock = logicalClock;
    }

    async setRow(rowKey: ValidKey, value: any): Promise<void> {
        if (value._key) {
            if (value._key !== rowKey) {
                throw new Error(
                    `Cannot set _key to a different value than the row key. ` +
                    `Expected '_key' to be '${rowKey}' but got '${value._key}'. ` +
                    `The _key field is reserved and managed automatically.`,
                );
            }
            // Strip _key before storing
            const { _key, ...cleanData } = value;
            value = cleanData;
        }

        const tx = this.idbRepository.transaction(
            [CLIENT_STATE_STORE, ROWS_STORE, OPERATIONS_STORE],
            "readwrite",
        );
        const row = await this.idbRepository.getRow(tx, this.tableName, rowKey);

        const dot = await this.nextDot(tx);
        const op: CRDTOperation = {
            type: "setRow",
            table: this.tableName,
            rowKey,
            value,
            dot,
        };

        applyOperationToRow(row, op);

        await Promise.all([
            this.idbRepository.saveRow(tx, row),
            this.idbRepository.saveOperation(tx, op),
        ]);
    }

    async setField(rowKey: ValidKey, field: any, value: any): Promise<void> {
        if (field === "_key") {
            throw new Error(
                `Cannot set _key field directly. ` +
                `The _key field is reserved and managed automatically.`,
            );
        }

        const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
        const row = await this.idbRepository.getRow(tx, this.tableName, rowKey);

        const dot = await this.nextDot(tx);
        const op: CRDTOperation = {
            type: "set",
            table: this.tableName,
            rowKey,
            field,
            value,
            dot,
        };

        applyOperationToRow(row, op);

        await Promise.all([
            this.idbRepository.saveRow(tx, row),
            this.idbRepository.saveOperation(tx, op),
        ]);
    }
    async deleteRow(rowKey: ValidKey) {
        const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
        const row = await this.idbRepository.getRow(tx, this.tableName, rowKey);

        // Build context from current fields
        const context: Record<string, number> = {};
        for (const fieldState of Object.values(row.fields)) {
            const clientId = fieldState.dot.clientId;
            context[clientId] = Math.max(context[clientId] ?? 0, fieldState.dot.version);
        }

        const dot = await this.nextDot(tx);
        const op: CRDTOperation = {
            type: "remove",
            table: this.tableName,
            rowKey,
            dot,
            context,
        };

        applyOperationToRow(row, op);

        await Promise.all([
            this.idbRepository.saveRow(tx, row),
            this.idbRepository.saveOperation(tx, op),
        ]);
    }

    //  ------------------------------------------------------------------------
    //  Access
    //  ------------------------------------------------------------------------
    async get(rowKey: ValidKey): Promise<Record<string, any> | undefined> {
        const tx = this.idbRepository.transaction(["rows"], "readonly");
        const row = await this.idbRepository.getRow(tx, this.tableName, rowKey);

        if (Object.keys(row.fields).length === 0) {
            return undefined;
        }

        // TODO: this is duplicated across multiple functions like indexes.query
        // We should have one place where we do this, probably where we define row
        const data: Record<string, any> = {};
        for (const [field, fieldState] of Object.entries(row.fields)) {
            data[field] = fieldState.value;
        }

        return Object.assign({ _key: rowKey }, data);
    }

    // TODO: typesafety of index name
    index(indexName: any): Index {
        if (!this.indexes.has(indexName)) {
            throw new Error(`Table ${this.tableName} does not have an index called ${indexName}`);
        }
        return new Index(this.tableName, indexName, this.idbRepository);
    }

    //  ------------------------------------------------------------------------
    //  Private
    //  ------------------------------------------------------------------------
    //  TODO: Move nextDot function to logicalClock
    private async nextDot(tx: IDBTransaction): Promise<Dot> {
        if (!this.idbRepository) {
            throw new Error("idbRepository is undefined in nextDot");
        }
        const version = await this.logicalClock.tick(tx);
        return { clientId: this.crdtDatabase.clientId, version };
    }
}
