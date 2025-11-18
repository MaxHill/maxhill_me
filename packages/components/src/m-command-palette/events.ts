export interface MCommandPaletteChangeEventDetail {
    example: string;
}

export class MCommandPaletteChangeEvent extends CustomEvent<MCommandPaletteChangeEventDetail> {
    constructor(detail: MCommandPaletteChangeEventDetail) {
        super('m-command-palette-change', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
