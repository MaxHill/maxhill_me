import { expect } from '@open-wc/testing';
import { MBagEditPage } from './index';

describe('MBagEditPage', () => {
  it('should be defined', () => {
    expect(MBagEditPage).to.exist;
  });

  it('should have the correct tag name', () => {
    expect(MBagEditPage.tagName).to.equal('m-bag-edit-page');
  });
});
