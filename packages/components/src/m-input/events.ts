export interface MInputChangeEventDetail {
    example: string;
}

export class MInputChangeEvent extends CustomEvent<MInputChangeEventDetail> {
    constructor(detail: MInputChangeEventDetail) {
        super('m-input-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
