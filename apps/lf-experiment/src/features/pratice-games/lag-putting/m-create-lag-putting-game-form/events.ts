import { CreateLagPuttingGameInput } from "../lag-putting-service";

//  ------------------------------------------------------------------------
//  Submit event
//  ------------------------------------------------------------------------
export interface CreateLagPuttingSubmitEventEventDetail {
  value: CreateLagPuttingGameInput;
}

export class CreateLagPuttingSubmitEventEvent
  extends CustomEvent<CreateLagPuttingSubmitEventEventDetail> {
  constructor(detail: CreateLagPuttingSubmitEventEventDetail) {
    super("create-lag-putting-submit-event", {
      detail,
      bubbles: true,
      composed: true,
    });
  }
}

//  ------------------------------------------------------------------------
//  Cancel event
//  ------------------------------------------------------------------------

export interface CreateLagPuttCancelEventDetail {}

export class CreateLagPuttCancelEvent extends CustomEvent<CreateLagPuttCancelEventDetail> {
  constructor(detail: CreateLagPuttCancelEventDetail) {
    super("create-lag-putt-cancel", {
      detail,
      bubbles: true,
      composed: true,
    });
  }
}
