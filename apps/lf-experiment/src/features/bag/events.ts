/*
Usage:

1. Import in your component:
   import { ClubSavedEvent } from "./events";

2. Dispatch the event:
   this.dispatchEvent(new ClubSavedEvent({ key, club }));
*/

import { Club } from "./club-service";

export interface ClubSavedEventDetail {
    key: string;
    club: Club;
}

export class ClubSavedEvent extends CustomEvent<ClubSavedEventDetail> {
    constructor(detail: ClubSavedEventDetail) {
        super('club-saved', {
            detail,
            bubbles: true,
            composed: true,
        });
    }
}
