import type { MOption } from "../m-option";

export interface MComboboxSelectEventDetail {
    option: MOption;
    selected: boolean;
}

export class MComboboxSelectEvent extends CustomEvent<MComboboxSelectEventDetail> {
    constructor(detail: MComboboxSelectEventDetail) {
        super('m-combobox-select', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export class MComboboxUnselectedEvent extends CustomEvent<MComboboxSelectEventDetail> {
    constructor(detail: MComboboxSelectEventDetail) {
        super('m-combobox-unselected', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MComboboxChangeEventDetail {
    selected: string[];
}

export class MComboboxChangeEvent extends CustomEvent<MComboboxChangeEventDetail> {
    constructor(detail: MComboboxChangeEventDetail) {
        super('m-combobox-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MComboboxFocusChangeEventDetail {
    option: MOption | null;
}

export class MComboboxFocusChangeEvent extends CustomEvent<MComboboxFocusChangeEventDetail> {
    constructor(detail: MComboboxFocusChangeEventDetail) {
        super('m-combobox-focus-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
