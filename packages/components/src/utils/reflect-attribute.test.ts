import { expect, fixture, html } from '@open-wc/testing';
import { BindAttribute, UpdatesAttribute } from './reflect-attribute';
import { MElement } from './m-element';

describe('UpdatesAttribute', () => {
  it('should sync property to attribute (one-way)', async () => {
    class TestElement extends MElement {
      static observedAttributes = [];

      @UpdatesAttribute()
      testProp: boolean = false;
    }
    customElements.define('test-updates-basic', TestElement);

    const el = await fixture<TestElement>(html`<test-updates-basic></test-updates-basic>`);
    
    expect(el.hasAttribute('testprop')).to.be.false;
    
    el.testProp = true;
    expect(el.hasAttribute('testprop')).to.be.true;
    
    el.testProp = false;
    expect(el.hasAttribute('testprop')).to.be.false;
  });

  it('should use custom attribute name', async () => {
    class TestElement extends MElement {
      static observedAttributes = [];

      @UpdatesAttribute({ attribute: 'aria-selected' })
      selected: boolean = false;
    }
    customElements.define('test-updates-custom-name', TestElement);

    const el = await fixture<TestElement>(html`<test-updates-custom-name></test-updates-custom-name>`);
    
    el.selected = true;
    expect(el.getAttribute('aria-selected')).to.equal('');
    
    el.selected = false;
    expect(el.hasAttribute('aria-selected')).to.be.false;
  });

  it('should support converter option', async () => {
    class TestElement extends MElement {
      static observedAttributes = [];

      @UpdatesAttribute({ 
        attribute: 'aria-selected',
        converter: (v) => v ? 'true' : 'false'
      })
      selected: boolean = false;
    }
    customElements.define('test-updates-converter', TestElement);

    const el = await fixture<TestElement>(html`<test-updates-converter></test-updates-converter>`);
    
    el.selected = true;
    expect(el.getAttribute('aria-selected')).to.equal('true');
    
    el.selected = false;
    expect(el.getAttribute('aria-selected')).to.equal('false');
  });

  it('should support converter returning null', async () => {
    class TestElement extends MElement {
      static observedAttributes = [];

      @UpdatesAttribute({ 
        attribute: 'aria-activedescendant',
        converter: (el: any) => el?.id ?? null
      })
      focusedElement: any = null;
    }
    customElements.define('test-updates-converter-null', TestElement);

    const el = await fixture<TestElement>(html`<test-updates-converter-null></test-updates-converter-null>`);
    
    expect(el.hasAttribute('aria-activedescendant')).to.be.false;
    
    el.focusedElement = { id: 'item-1' };
    expect(el.getAttribute('aria-activedescendant')).to.equal('item-1');
    
    el.focusedElement = null;
    expect(el.hasAttribute('aria-activedescendant')).to.be.false;
  });

  it('should stack with BindAttribute on same property', async () => {
    class TestElement extends MElement {
      static observedAttributes = ['selected'];

      @BindAttribute()
      @UpdatesAttribute({ 
        attribute: 'aria-selected',
        converter: (v) => v ? 'true' : 'false'
      })
      selected: boolean = false;
    }
    customElements.define('test-updates-stacked', TestElement);

    const el = await fixture<TestElement>(html`<test-updates-stacked></test-updates-stacked>`);
    
    el.selected = true;
    expect(el.hasAttribute('selected')).to.be.true;
    expect(el.getAttribute('aria-selected')).to.equal('true');
    
    el.selected = false;
    expect(el.hasAttribute('selected')).to.be.false;
    expect(el.getAttribute('aria-selected')).to.equal('false');
  });

  it('should stack multiple UpdatesAttribute decorators', async () => {
    class TestElement extends MElement {
      static observedAttributes = ['active'];

      @BindAttribute()
      @UpdatesAttribute({ 
        attribute: 'aria-selected',
        converter: (v) => v ? 'true' : 'false'
      })
      @UpdatesAttribute({ 
        attribute: 'tabindex',
        converter: (v) => v ? '0' : '-1'
      })
      active: boolean = false;
    }
    customElements.define('test-updates-multiple', TestElement);

    const el = await fixture<TestElement>(html`<test-updates-multiple></test-updates-multiple>`);
    
    el.active = true;
    expect(el.hasAttribute('active')).to.be.true;
    expect(el.getAttribute('aria-selected')).to.equal('true');
    expect(el.getAttribute('tabindex')).to.equal('0');
    
    el.active = false;
    expect(el.hasAttribute('active')).to.be.false;
    expect(el.getAttribute('aria-selected')).to.equal('false');
    expect(el.getAttribute('tabindex')).to.equal('-1');
  });

  it('should handle string properties', async () => {
    class TestElement extends MElement {
      static observedAttributes = [];

      @UpdatesAttribute({ attribute: 'data-value' })
      value: string = '';
    }
    customElements.define('test-updates-string', TestElement);

    const el = await fixture<TestElement>(html`<test-updates-string></test-updates-string>`);
    
    expect(el.hasAttribute('data-value')).to.be.false;
    
    el.value = 'test';
    expect(el.getAttribute('data-value')).to.equal('test');
    
    el.value = '';
    expect(el.hasAttribute('data-value')).to.be.false;
  });

  it('should handle number properties', async () => {
    class TestElement extends MElement {
      static observedAttributes = [];

      @UpdatesAttribute({ attribute: 'data-count' })
      count: number = 0;
    }
    customElements.define('test-updates-number', TestElement);

    const el = await fixture<TestElement>(html`<test-updates-number></test-updates-number>`);
    
    el.count = 5;
    expect(el.getAttribute('data-count')).to.equal('5');
    
    el.count = 0;
    expect(el.getAttribute('data-count')).to.equal('0');
  });
});
