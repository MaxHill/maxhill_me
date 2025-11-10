import type { MTab } from "../m-tab";
import type { MTabPanel } from "../m-tab-panel";

export interface MTabChangeEventDetail {
    tab: MTab;
    panel: MTabPanel;
}

export class MTabShowEvent extends CustomEvent<MTabChangeEventDetail> {
    constructor(detail: MTabChangeEventDetail) {
        super('m-tab-show', {
            detail,
            bubbles: true,
            composed: true
        });
    }
}

export class MTabHideEvent extends CustomEvent<MTabChangeEventDetail> {
    constructor(detail: MTabChangeEventDetail) {
        super('m-tab-hide', {
            detail,
            bubbles: true,
            composed: true
        });
    }
}
