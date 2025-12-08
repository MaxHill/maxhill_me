export interface MInvalidEventDetail {
    validity: ValidityState;
    validationMessage: string;
    value: string | string[] | null;
}

export class MInvalidEvent extends CustomEvent<MInvalidEventDetail> {
    constructor(detail: MInvalidEventDetail) {
        super('m-invalid', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
