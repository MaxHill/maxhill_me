import { expect, html, fixture } from '@open-wc/testing';
import { MInput } from './index';

MInput.define();

describe('m-input', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-input>Test content</m-input>
      `);

      await expect(el).to.be.accessible();
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
});
