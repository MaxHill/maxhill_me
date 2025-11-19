export function BindAttribute(options?: { 
  attribute?: string;
  converter?: (value: any) => string;
}) {
  return function(_target: any, context: ClassFieldDecoratorContext) {
    const propertyKey = context.name as string;
    const attributeName = options?.attribute || propertyKey.toLowerCase();
    
    const setupClassMetadata = (ctor: any, type: string) => {
      if (!ctor.__syncedAttributes) {
        ctor.__syncedAttributes = [];
      }
      if (!ctor.__syncedAttributes.includes(attributeName)) {
        ctor.__syncedAttributes.push(attributeName);
      }
      
      if (!ctor.__attributeToProperty) {
        ctor.__attributeToProperty = new Map();
      }
      ctor.__attributeToProperty.set(attributeName, { propertyKey, type });
    };
    
    return function(this: any, initialValue: any) {
      const type = typeof initialValue;
      const privateKey = Symbol.for(`_${propertyKey}`);
      
      setupClassMetadata(this.constructor, type);
      
      Object.defineProperty(this, propertyKey, {
        get(this: any) {
          return this[privateKey];
        },
        set(this: any, newValue: any) {
          const oldValue = this[privateKey];
          if (oldValue === newValue) return;
          
          this[privateKey] = newValue;
          
          if (this instanceof HTMLElement) {
            if (type === 'boolean') {
              if (newValue) {
                this.setAttribute(attributeName, '');
              } else {
                this.removeAttribute(attributeName);
              }
            } else {
              if (newValue == null || newValue === '') {
                this.removeAttribute(attributeName);
              } else {
                const strValue = options?.converter ? options.converter(newValue) : String(newValue);
                this.setAttribute(attributeName, strValue);
              }
            }
          }
        },
        enumerable: true,
        configurable: true
      });
      
      this[privateKey] = initialValue;
      return initialValue;
    };
  };
}

export function UpdatesAttribute(options?: { 
  attribute?: string;
  converter?: (value: any) => string | null;
}) {
  return function(_target: any, context: ClassFieldDecoratorContext) {
    const propertyKey = context.name as string;
    const attributeName = options?.attribute || propertyKey.toLowerCase();
    
    return function(this: any, initialValue: any) {
      const type = typeof initialValue;
      const privateKey = Symbol.for(`_${propertyKey}`);
      
      const existingDescriptor = Object.getOwnPropertyDescriptor(this, propertyKey);
      const existingSetter = existingDescriptor?.set;
      const existingGetter = existingDescriptor?.get;
      
      Object.defineProperty(this, propertyKey, {
        get(this: any) {
          if (existingGetter) {
            return existingGetter.call(this);
          }
          return this[privateKey];
        },
        set(this: any, newValue: any) {
          const oldValue = existingGetter ? existingGetter.call(this) : this[privateKey];
          if (oldValue === newValue) return;
          
          if (existingSetter) {
            existingSetter.call(this, newValue);
          } else {
            this[privateKey] = newValue;
          }
          
          if (this instanceof HTMLElement) {
            if (options?.converter) {
              const converted = options.converter(newValue);
              if (converted == null) {
                this.removeAttribute(attributeName);
              } else {
                this.setAttribute(attributeName, converted);
              }
            } else if (type === 'boolean') {
              if (newValue) {
                this.setAttribute(attributeName, '');
              } else {
                this.removeAttribute(attributeName);
              }
            } else {
              if (newValue == null || newValue === '') {
                this.removeAttribute(attributeName);
              } else {
                this.setAttribute(attributeName, String(newValue));
              }
            }
          }
        },
        enumerable: true,
        configurable: true
      });
      
      if (!existingGetter) {
        this[privateKey] = initialValue;
      }
      
      return initialValue;
    };
  };
}

export function handleAttributeChange(element: HTMLElement, name: string, newValue: string | null) {
  const ctor = element.constructor as any;
  const mapping = ctor.__attributeToProperty?.get(name);
  
  if (mapping) {
    const { propertyKey, type } = mapping;
    
    let propertyValue: any;
    if (type === 'boolean') {
      propertyValue = newValue !== null;
    } else if (type === 'number') {
      propertyValue = newValue ? Number(newValue) : undefined;
    } else {
      propertyValue = newValue || '';
    }
    
    (element as any)[propertyKey] = propertyValue;
  }
}
