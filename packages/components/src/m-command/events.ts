import { CommandDefinition } from ".";

export interface MCommandEventDetail {
    command: CommandDefinition;
}

export class MCommandRegisterEvent extends CustomEvent<MCommandEventDetail> {
    constructor(detail: MCommandEventDetail) {
        super('m-command-register', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export class MCommandUnRegisterEvent extends CustomEvent<MCommandEventDetail> {
    constructor(detail: MCommandEventDetail) {
        super('m-command-unregister', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export class MCommandTriggerEvent extends CustomEvent<MCommandEventDetail> {
    constructor(detail: MCommandEventDetail) {
        super('m-command-trigger', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
