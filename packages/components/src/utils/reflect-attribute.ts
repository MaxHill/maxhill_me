export function reflectAttribute(
    instance: HTMLElement,
    attrName: string,
    value: string | boolean | undefined
): string | boolean | undefined {
    if (value) {
        instance.setAttribute(attrName, typeof value === 'boolean' ? '' : String(value));
    } else {
        instance.removeAttribute(attrName);
    }
    return value;
}


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

export function handleAttributeChange(element: HTMLElement, name: string, newValue: string | null) {
  const ctor = element.constructor as any;
  const mapping = ctor.__attributeToProperty?.get(name);
  
  if (mapping) {
    const { propertyKey, type } = mapping;
    const privateKey = Symbol.for(`_${propertyKey}`);
    
    let propertyValue: any;
    if (type === 'boolean') {
      propertyValue = newValue !== null;
    } else if (type === 'number') {
      propertyValue = newValue ? Number(newValue) : undefined;
    } else {
      propertyValue = newValue || '';
    }
    
    (element as any)[privateKey] = propertyValue;
  }
}
