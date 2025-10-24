export class Compo extends HTMLElement {
  #shadowRoot: ShadowRoot;
  static #styles = new CSSStyleSheet();

  static {
    this.#styles.replaceSync(`
      :host {
        display: block;
        background: var(--color-accent-fill-mid);
        color: var(--color-accent-text-on-loud);
        border: 3px solid var(--color-accent-stroke-mid);
      }
    `);
  }

  constructor() {
    super();
    this.#shadowRoot = this.attachShadow({ mode: 'open' });
    this.#shadowRoot.adoptedStyleSheets = [Compo.#styles];
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.#shadowRoot.innerHTML = `
      <div><slot/></div>
    `;
  }
}

customElements.define('my-compo', Compo);
