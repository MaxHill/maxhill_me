export interface CreateLagPuttCancelEventDetail { }

export class CreateLagPuttCancelEvent extends CustomEvent<CreateLagPuttCancelEventDetail> {
    constructor(detail: CreateLagPuttCancelEventDetail) {
        super('create-lag-putt-cancel', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
