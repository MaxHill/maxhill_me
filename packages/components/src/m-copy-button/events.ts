export interface CopySuccessEventDetail {
    value: string;
}

export class CopySuccessEvent extends CustomEvent<CopySuccessEventDetail> {
    constructor(detail: CopySuccessEventDetail) {
        super('copy-success', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface CopyErrorEventDetail {
    error: Error;
}

export class CopyErrorEvent extends CustomEvent<CopyErrorEventDetail> {
    constructor(detail: CopyErrorEventDetail) {
        super('copy-error', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
