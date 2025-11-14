export interface MCommandChangeEventDetail {
    example: string;
}

export class MCommandChangeEvent extends CustomEvent<MCommandChangeEventDetail> {
    constructor(detail: MCommandChangeEventDetail) {
        super('m-command-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
