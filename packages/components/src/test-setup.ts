if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.attachInternals) {
  class MockElementInternals {
    #value: string = '';
    #element: HTMLElement;
    #states: Set<string>;

    constructor(element: HTMLElement) {
      this.#element = element;
      this.#states = new Set();
    }

    get states(): Set<string> {
      return this.#states;
    }

    setFormValue(value: string | FormData | null) {
      this.#value = typeof value === 'string' ? value : '';
    }

    getValue(): string {
      return this.#value;
    }

    get form(): HTMLFormElement | null {
      return this.#element.closest('form');
    }

    setValidity() {}
    checkValidity(): boolean {
      return true;
    }
    reportValidity(): boolean {
      return true;
    }
    get validationMessage(): string {
      return '';
    }
    get validity(): ValidityState {
      return {
        valueMissing: false,
        typeMismatch: false,
        patternMismatch: false,
        tooLong: false,
        tooShort: false,
        rangeUnderflow: false,
        rangeOverflow: false,
        stepMismatch: false,
        badInput: false,
        customError: false,
        valid: true,
      };
    }
    get willValidate(): boolean {
      return true;
    }
    get labels(): NodeList {
      return document.createDocumentFragment().childNodes;
    }
  }

  const internalsMap = new WeakMap<HTMLElement, MockElementInternals>();

  HTMLElement.prototype.attachInternals = function (this: HTMLElement): ElementInternals {
    const internals = new MockElementInternals(this);
    internalsMap.set(this, internals);

    return internals as unknown as ElementInternals;
  };

  const OriginalFormData = FormData;
  // @ts-ignore
  globalThis.FormData = class extends OriginalFormData {
    constructor(form?: HTMLFormElement) {
      super(form);
      
      if (form) {
        const formElements = form.querySelectorAll('*');
        formElements.forEach((el) => {
          if (el instanceof HTMLElement) {
            const internals = internalsMap.get(el);
            if (internals) {
              const name = el.getAttribute('name');
              const value = internals.getValue();
              if (name && value) {
                this.append(name, value);
              }
            }
          }
        });
      }
    }
  };
}
