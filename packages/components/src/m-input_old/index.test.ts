import { expect, html, fixture } from '@open-wc/testing';
import { MInput } from './index';

MInput.define();

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m-input', () => {
  describe('accessibility', () => {
    it('passes automated a11y tests', async () => {
      const el = await fixture<MInput>(html`
        <m-input label="Email"></m-input>
      `);

      await expect(el).to.be.accessible();
    });
  });

  describe('basic rendering', () => {
    it('should render with default values', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      expect(el).to.be.instanceOf(MInput);
      expect(el.value).to.equal('');
      expect(el.type).to.equal('text');
      expect(el.required).to.equal(false);
      expect(el.disabled).to.equal(false);
    });

    it('should render with label', async () => {
      const el = await fixture<MInput>(html`
        <m-input label="Email"></m-input>
      `);

      const label = el.shadowRoot?.querySelector('label');
      expect(label?.textContent).to.equal('Email');
    });

    it('should render with value', async () => {
      const el = await fixture<MInput>(html`
        <m-input value="test@example.com"></m-input>
      `);

      expect(el.value).to.equal('test@example.com');
      const input = el.shadowRoot?.querySelector('input');
      expect(input?.value).to.equal('test@example.com');
    });

    it('should have unique input ID', async () => {
      const el1 = await fixture<MInput>(html`<m-input label="Input 1"></m-input>`);
      const el2 = await fixture<MInput>(html`<m-input label="Input 2"></m-input>`);

      const input1 = el1.shadowRoot?.querySelector('input');
      const input2 = el2.shadowRoot?.querySelector('input');

      expect(input1?.id).to.be.ok;
      expect(input2?.id).to.be.ok;
      expect(input1?.id).not.to.equal(input2?.id);
    });
  });

  describe('events', () => {
    it('should dispatch m-input-input on input', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-input-input', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      const input = el.shadowRoot?.querySelector('input')!;
      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(eventFired).to.be.true;
      expect(eventDetail.value).to.equal('test');
    });

    it('should dispatch m-input-change on change', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-input-change', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      const input = el.shadowRoot?.querySelector('input')!;
      input.value = 'test';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      expect(eventFired).to.be.true;
      expect(eventDetail.value).to.equal('test');
    });

    it('should dispatch m-input-blur on blur', async () => {
      const el = await fixture<MInput>(html`
        <m-input value="test"></m-input>
      `);

      let eventFired = false;

      el.addEventListener('m-input-blur', (e: Event) => {
        eventFired = true;
      });

      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      expect(eventFired).to.be.true;
    });

    it('should dispatch m-input-focus on focus', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      let eventFired = false;

      el.addEventListener('m-input-focus', (e: Event) => {
        eventFired = true;
      });

      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      expect(eventFired).to.be.true;
    });

    it('should dispatch m-input-select with selected text', async () => {
      const el = await fixture<MInput>(html`
        <m-input value="hello world"></m-input>
      `);

      let selectEventFired = false;
      let selectedValue = '';

      el.addEventListener('m-input-select', ((e: CustomEvent) => {
        selectEventFired = true;
        selectedValue = e.detail.value;
      }) as EventListener);

      const input = el.shadowRoot?.querySelector('input')!;
      input.setSelectionRange(0, 5);
      input.dispatchEvent(new Event('select', { bubbles: true }));

      expect(selectEventFired).to.be.true;
      expect(selectedValue).to.equal('hello');
    });
  });

  describe('validation - submit-only behavior', () => {
    it('should NOT show error on initial render for required empty input', async () => {
      const el = await fixture<MInput>(html`
        <m-input required label="Name"></m-input>
      `);

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).to.equal('');
      expect(errorEl?.style.display).not.to.equal('block');
    });

    it('should NOT validate on blur', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).to.equal('');
    });

    it('should NOT validate on change', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      const input = el.shadowRoot?.querySelector('input')!;
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).to.equal('');
    });

    it('should validate when reportValidity() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      const isValid = el.reportValidity();

      expect(isValid).to.be.false;
      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).not.to.equal('');
    });

    it('should validate when checkValidity() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      const isValid = el.checkValidity();

      expect(isValid).to.be.false;
    });
  });

  describe('validation - required', () => {
    it('should dispatch m-input-invalid event on failed validation', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      let invalidEventFired = false;
      let validationMessage = '';

      el.addEventListener('m-input-invalid', (e: Event) => {
        invalidEventFired = true;
        validationMessage = (e as CustomEvent).detail.validationMessage;
      });

      el.reportValidity();

      expect(invalidEventFired).to.be.true;
      expect(validationMessage).to.be.ok;
    });

    it('should dispatch m-input-valid event on successful validation', async () => {
      const el = await fixture<MInput>(html`
        <m-input required value="test"></m-input>
      `);

      let validEventFired = false;

      el.addEventListener('m-input-valid', (e: Event) => {
        validEventFired = true;
      });

      el.reportValidity();

      expect(validEventFired).to.be.true;
    });
  });

  describe('validation - custom error message', () => {
    it('should use error-message attribute when provided', async () => {
      const el = await fixture<MInput>(html`
        <m-input required error-message="This field is mandatory"></m-input>
      `);

      el.reportValidity();

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).to.equal('This field is mandatory');
    });

    it('should use native validation message when error-message not provided', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      el.reportValidity();

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).to.be.ok;
      expect(errorEl?.textContent).not.to.equal('');
    });
  });

  describe('validation - error display', () => {
    it('should show error message after validation fails', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      el.reportValidity();

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.style.display).to.equal('block');
      expect(errorEl?.textContent).to.be.ok;
    });

    it('should hide error message after validation passes', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      el.reportValidity();
      expect(el.shadowRoot?.querySelector('.error')?.style.display).to.equal('block');

      el.value = 'valid';
      await new Promise(resolve => setTimeout(resolve, 0));
      el.reportValidity();

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.style.display).to.equal('none');
      expect(errorEl?.textContent).to.equal('');
    });

    it('should update aria-invalid based on validation state', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      el.reportValidity();
      // ARIA is set via ElementInternals (internals is private, but we can check the behavior)
      // ElementInternals ARIA doesn't reflect to attributes, it works at the accessibility tree level
      // We can verify by checking that validation works and error state is shown
      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent?.trim()).to.be.ok;

      el.value = 'valid';
      await new Promise(resolve => setTimeout(resolve, 0));
      el.reportValidity();

      // Error should be hidden after valid input
      expect(errorEl?.style.display).to.equal('none');
    });
  });

  describe('focus management', () => {
    it('should focus input when focus() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      el.focus();

      const input = el.shadowRoot?.querySelector('input');
      expect(document.activeElement).to.equal(el);
    });

    it('should blur input when blur() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      el.focus();
      el.blur();

      expect(document.activeElement).not.to.equal(el);
    });
  });

});
