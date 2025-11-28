import { expect, html, fixture } from '@open-wc/testing';
import { MInput } from './index';

MInput.define();

describe('m-input', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-input label="Test input">Test content</m-input>
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
  });

  describe('validation behavior', () => {
    it('should NOT show error on initial render for required empty input', async () => {
      const el = await fixture<MInput>(html`
        <m-input required label="Name"></m-input>
      `);

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).to.equal('');
      expect(errorEl?.style.display).not.to.equal('block');
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

    it('should dispatch m-invalid event on failed validation', async () => {
      const el = await fixture<MInput>(html`
        <m-input minlength="5"></m-input>
      `);

      let invalidEventFired = false;
      let validationMessage = '';

      el.addEventListener('m-invalid', (e: Event) => {
        invalidEventFired = true;
        validationMessage = (e as CustomEvent).detail.validationMessage;
      });

      // Set a value that's too short and trigger validation by blurring
      const input = el.shadowRoot?.querySelector('input')!;
      input.value = 'abc';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(invalidEventFired).to.be.true;
      expect(validationMessage).to.be.ok;
      expect(validationMessage).to.include('5 characters');
    });
  });

  describe('error display', () => {
    it('should show error message after validation fails', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      // Trigger validation by blurring empty required field
      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      const errorEl = el.shadowRoot?.querySelector('.error') as HTMLElement;
      const displayStyle = window.getComputedStyle(errorEl).display;
      // Should be visible (inline-block in CSS, but may compute to block)
      expect(displayStyle).to.not.equal('none');
      expect(errorEl?.textContent).to.be.ok;
    });

    it('should hide error message after validation passes', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      // Trigger validation by blurring empty required field
      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      const errorEl = el.shadowRoot?.querySelector('.error') as HTMLElement;
      // Should be visible (inline-block in CSS, but may compute to block)
      expect(window.getComputedStyle(errorEl).display).to.not.equal('none');

      // Fix the validation error
      el.value = 'valid';
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(window.getComputedStyle(errorEl).display).to.equal('none');
      expect(errorEl?.textContent).to.equal('');
    });

    it('should update aria-invalid based on validation state', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      // Trigger validation by blurring empty required field
      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should be invalid
      expect(el.internals.ariaInvalid).to.equal('true');

      // Fix the validation error
      el.value = 'valid';
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should now be valid
      expect(el.internals.ariaInvalid).to.equal('false');
    });
  });

  describe('focus management', () => {
    it('should focus input when focus() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      el.focus();

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

  describe('form validation', () => {
    it('should be invalid when required field is empty', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" required></m-input>
      `);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(input.internals.validity.valid).to.be.false;
      expect(input.internals.validity.valueMissing).to.be.true;
    });

    it('should be valid when required field has value', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" required value="test"></m-input>
      `);

      expect(input.internals.validity.valid).to.be.true;
      expect(input.internals.validity.valueMissing).to.be.false;
    });

    it('should validate minlength constraint', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" minlength="3"></m-input>
      `);

      input.value = 'ab';
      expect(input.internals.validity.valid).to.be.false;
      expect(input.internals.validity.tooShort).to.be.true;

      input.value = 'abc';
      expect(input.internals.validity.valid).to.be.true;
      expect(input.internals.validity.tooShort).to.be.false;
    });

    it('should validate maxlength constraint', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" maxlength="3"></m-input>
      `);

      input.value = 'abcd';
      expect(input.internals.validity.valid).to.be.false;
      expect(input.internals.validity.tooLong).to.be.true;

      input.value = 'abc';
      expect(input.internals.validity.valid).to.be.true;
      expect(input.internals.validity.tooLong).to.be.false;
    });

    it('should validate pattern constraint', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" pattern="[0-9]+"></m-input>
      `);

      input.value = 'abc';
      expect(input.internals.validity.valid).to.be.false;
      expect(input.internals.validity.patternMismatch).to.be.true;

      input.value = '123';
      expect(input.internals.validity.valid).to.be.true;
      expect(input.internals.validity.patternMismatch).to.be.false;
    });

    it('should validate email type', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" type="email"></m-input>
      `);

      input.value = 'not-an-email';
      expect(input.internals.validity.valid).to.be.false;
      expect(input.internals.validity.typeMismatch).to.be.true;

      input.value = 'test@example.com';
      expect(input.internals.validity.valid).to.be.true;
      expect(input.internals.validity.typeMismatch).to.be.false;
    });

    it('should validate url type', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" type="url"></m-input>
      `);

      input.value = 'not-a-url';
      expect(input.internals.validity.valid).to.be.false;
      expect(input.internals.validity.typeMismatch).to.be.true;

      input.value = 'https://example.com';
      expect(input.internals.validity.valid).to.be.true;
      expect(input.internals.validity.typeMismatch).to.be.false;
    });

    it('should show validation error message for required field', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" required></m-input>
      `);

      expect(input.internals.validationMessage).to.not.be.empty;
      expect(input.internals.validationMessage.toLowerCase()).to.include('required');
    });

    it('should focus first invalid field when form is submitted with multiple invalid fields', async () => {
      const form = await fixture(html`
        <form>
          <m-input id="field1" name="field1" required></m-input>
          <m-input id="field2" name="field2" minlength="5"></m-input>
          <m-input id="field3" name="field3" required></m-input>
          <button type="submit">Submit</button>
        </form>
      `) as HTMLFormElement;

      const field1 = form.querySelector('#field1') as MInput;
      const field2 = form.querySelector('#field2') as MInput;
      const field3 = form.querySelector('#field3') as MInput;
      const button = form.querySelector('button') as HTMLButtonElement;

      // Set values to make field2 and field3 invalid, field1 valid
      field1.value = 'valid';
      field2.value = 'abc'; // Too short
      field3.value = ''; // Required but empty

      // Wait for validation to update
      await new Promise(resolve => setTimeout(resolve, 0));

      // Focus the button first (simulating user clicking submit)
      button.focus();
      expect(document.activeElement).to.equal(button);

      // Trigger form validation (this will fire invalid events)
      form.reportValidity();

      // Wait for focus to be applied
      await new Promise(resolve => setTimeout(resolve, 10));

      // The first invalid field (field2) should be focused
      expect(document.activeElement).to.equal(field2);
    });

    it('should focus first field when all fields are invalid', async () => {
      const form = await fixture(html`
        <form>
          <m-input id="field1" name="field1" required></m-input>
          <m-input id="field2" name="field2" required></m-input>
          <m-input id="field3" name="field3" required></m-input>
          <button type="submit">Submit</button>
        </form>
      `) as HTMLFormElement;

      const field1 = form.querySelector('#field1') as MInput;
      const button = form.querySelector('button') as HTMLButtonElement;

      // All fields are empty (invalid)
      button.focus();
      expect(document.activeElement).to.equal(button);

      // Trigger form validation (this will fire invalid events)
      form.reportValidity();

      // Wait for focus to be applied
      await new Promise(resolve => setTimeout(resolve, 10));

      // The first field should be focused
      expect(document.activeElement).to.equal(field1);
    });
  });

  describe('readonly attribute', () => {
    it('should set readonly attribute on inner input', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" readonly value="initial"></m-input>
      `);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Readonly property should be set
      expect(input.readonly).to.be.true;
      
      // Inner input should have readonly attribute
      const innerInput = input.shadowRoot?.querySelector('input');
      expect(innerInput?.hasAttribute('readonly')).to.be.true;
    });

    it('should allow programmatic updates when readonly', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" readonly value="initial"></m-input>
      `);
      
      // Value should be accessible
      expect(input.value).to.equal('initial');
      
      // Programmatic updates should still work
      input.value = 'updated';
      expect(input.value).to.equal('updated');
    });

    it('should submit readonly field value with form', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-input name="readonly-field" readonly value="test"></m-input>
        </form>
      `);
      
      const formData = new FormData(form);
      expect(formData.get('readonly-field')).to.equal('test');
    });

    it('should validate readonly fields', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" readonly required></m-input>
      `);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Readonly fields should still be validated
      expect(input.internals.validity.valid).to.be.false;
      expect(input.internals.validity.valueMissing).to.be.true;
    });

    it('should pass validation when readonly field has value', async () => {
      const input = await fixture<MInput>(html`
        <m-input name="test-input" readonly required value="test"></m-input>
      `);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Should be valid
      expect(input.internals.validity.valid).to.be.true;
    });
  });
});
