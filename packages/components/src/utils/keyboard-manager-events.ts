import { Commands } from "./keyboard-manager";

export interface MKeyboardManagerChangeEventDetail {
    commands: Commands;
}

export class MKeyboardMangerChangeEvent extends CustomEvent<MKeyboardManagerChangeEventDetail> {
    constructor(detail: MKeyboardManagerChangeEventDetail) {
        super('m-keyboard-commands-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
