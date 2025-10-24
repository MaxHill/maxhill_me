export class Compo extends HTMLElement {
  #shadowRoot: ShadowRoot;
  static #styles = new CSSStyleSheet();

  static {
    this.#styles.replaceSync(`
      :host {
        display: block;
        background: var(--color-accent);
        color: var(--color-text-on-accent);
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
