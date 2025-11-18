import type { MOption } from "../m-option";

export interface MListboxSelectEventDetail {
    item: MOption;
    selected: boolean;
}

export class MListboxSelectEvent extends CustomEvent<MListboxSelectEventDetail> {
    constructor(detail: MListboxSelectEventDetail) {
        super('m-listbox-select', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export class MListboxUnselectedEvent extends CustomEvent<MListboxSelectEventDetail> {
    constructor(detail: MListboxSelectEventDetail) {
        super('m-listbox-unselected', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MListboxChangeEventDetail {
    selected: string[];
}

export class MListboxChangeEvent extends CustomEvent<MListboxChangeEventDetail> {
    constructor(detail: MListboxChangeEventDetail) {
        super('m-listbox-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MListboxFocusChangeEventDetail {
    item: MOption | null;
}

export class MListboxFocusChangeEvent extends CustomEvent<MListboxFocusChangeEventDetail> {
    constructor(detail: MListboxFocusChangeEventDetail) {
        super('m-listbox-focus-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
