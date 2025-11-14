export interface MInputChangeEventDetail {
    value: string;
}

export class MInputChangeEvent extends CustomEvent<MInputChangeEventDetail> {
    constructor(detail: MInputChangeEventDetail) {
        super('m-input-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MInputInputEventDetail {
    value: string;
}

export class MInputInputEvent extends CustomEvent<MInputInputEventDetail> {
    constructor(detail: MInputInputEventDetail) {
        super('m-input-input', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MInputBlurEventDetail {
    value: string;
}

export class MInputBlurEvent extends CustomEvent<MInputBlurEventDetail> {
    constructor(detail: MInputBlurEventDetail) {
        super('m-input-blur', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MInputFocusEventDetail {
    value: string;
}

export class MInputFocusEvent extends CustomEvent<MInputFocusEventDetail> {
    constructor(detail: MInputFocusEventDetail) {
        super('m-input-focus', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MInputSelectEventDetail {
    value: string;
}

export class MInputSelectEvent extends CustomEvent<MInputSelectEventDetail> {
    constructor(detail: MInputSelectEventDetail) {
        super('m-input-select', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MInputInvalidEventDetail {
    validationMessage: string;
}

export class MInputInvalidEvent extends CustomEvent<MInputInvalidEventDetail> {
    constructor(detail: MInputInvalidEventDetail) {
        super('m-input-invalid', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}

export interface MInputValidEventDetail {
    value: string;
}

export class MInputValidEvent extends CustomEvent<MInputValidEventDetail> {
    constructor(detail: MInputValidEventDetail) {
        super('m-input-valid', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
