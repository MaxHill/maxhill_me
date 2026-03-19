export interface MTextareaClearEventDetail {
    value: string;
}

export class MTextareaClearEvent extends CustomEvent<MTextareaClearEventDetail> {
    constructor(detail: MTextareaClearEventDetail) {
        super('m-textarea-clear', {
            detail,
            bubbles: true,
            composed: true,
            cancelable: true,
        });
    }
}
