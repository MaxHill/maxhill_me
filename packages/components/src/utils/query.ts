// query.ts

type QueryOptions = {
    dom: "shadow" | "light";
}

export function query(selector: string, options?: QueryOptions) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    if (context.kind !== "field") {
      throw new Error("@query can only be applied to fields");
    }

    context.addInitializer(function () {
      Object.defineProperty(this, context.name, {
        get(this: HTMLElement) {
          const dom = (options?.dom ?? "shadow") === "shadow" ? this.shadowRoot : this;
          return dom?.querySelector(selector) ?? null;
        },
        enumerable: true,
        configurable: true,
      });
    });
  };
}

/**
 * @queryAll(selector)
 * Creates a getter that returns this.shadowRoot?.querySelectorAll(selector)
 */
export function queryAll(selector: string, options?: QueryOptions) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    if (context.kind !== "field") {
      throw new Error("@queryAll can only be applied to fields");
    }

    context.addInitializer(function () {
      Object.defineProperty(this, context.name, {
        get(this: HTMLElement) {
          const dom = (options?.dom ?? "shadow") === "shadow" ? this.shadowRoot : this;
          return Array.from(dom?.querySelectorAll(selector) ?? []);
        },
        enumerable: true,
        configurable: true,
      });
    });
  };
}
