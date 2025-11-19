export interface MOptionSelectedChangeEventDetail {
    selected: boolean;
}

export class MOptionSelectedChangeEvent extends CustomEvent<MOptionSelectedChangeEventDetail> {
    constructor(detail: MOptionSelectedChangeEventDetail) {
        super('m-option-selected-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
