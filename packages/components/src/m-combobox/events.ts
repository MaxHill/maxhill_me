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
