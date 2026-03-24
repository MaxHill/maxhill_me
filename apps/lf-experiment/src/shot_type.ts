import { CRDTDatabase, Table } from "@maxhill/idb-distribute";

//  Types
//  ------------------------------------------------------------------------
export type ShotType = {
  name: string;
  description: string;
};

//  Repository
//  ------------------------------------------------------------------------
export class ShotTypeRepository {
  table: Table;
  constructor(private db: CRDTDatabase<{ shot_types: {} }>) {
    this.table = this.db.table("shot_types");
  }

  async addShotType(shot_type: ShotType) {
    await this.table.setRow(crypto.randomUUID(), shot_type);
  }
  async remove_shot_type(id: string) {
    await this.table.deleteRow(id);
  }
}

//  Components
//  ------------------------------------------------------------------------
import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./shot_type.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class ShotTypeList extends MElement {
  static tagName = "m-shot-type-list";

  static observedAttributes = ["example"];
  @BindAttribute()
  example: string = "";

  #shadowRoot: ShadowRoot;

  constructor() {
    super();
    this.#shadowRoot = this.attachShadow({ mode: "open" });
    this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.#shadowRoot.innerHTML = `
            <div></div>
        `;
  }
}
