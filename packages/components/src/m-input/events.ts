export interface MInputClearEventDetail {
    value: string;
}

export class MInputClearEvent extends CustomEvent<MInputClearEventDetail> {
    constructor(detail: MInputClearEventDetail) {
        super('m-input-clear', {
            detail,
            bubbles: true,
            composed: true,
            cancelable: true,
        });
    }
}
