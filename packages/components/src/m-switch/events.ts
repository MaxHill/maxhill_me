export interface MSwitchChangeEventDetail {
    example: string;
}

export class MSwitchChangeEvent extends CustomEvent<MSwitchChangeEventDetail> {
    constructor(detail: MSwitchChangeEventDetail) {
        super('m-switch-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
