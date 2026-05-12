import type { MOption } from "../m-option";

export interface MListboxSelectEventDetail {
    option: MOption;
}

export class MListboxSelectEvent extends CustomEvent<MListboxSelectEventDetail> {
    constructor(detail: MListboxSelectEventDetail) {
        super("m-listbox-select", {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MListboxUnselectedEventDetail {
    option: MOption;
}

export class MListboxUnselectedEvent extends CustomEvent<MListboxUnselectedEventDetail> {
    constructor(detail: MListboxUnselectedEventDetail) {
        super("m-listbox-unselected", {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MListboxChangeEventDetail {
    option: MOption | null;
    selected: string[];
}

export class MListboxChangeEvent extends CustomEvent<MListboxChangeEventDetail> {
    constructor(detail: MListboxChangeEventDetail) {
        super("m-listbox-change", {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MListboxFocusChangeEventDetail {
    option: MOption | null;
}

export class MListboxFocusChangeEvent extends CustomEvent<MListboxFocusChangeEventDetail> {
    constructor(detail: MListboxFocusChangeEventDetail) {
        super("m-listbox-focus-change", {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
