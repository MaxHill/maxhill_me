import { expect } from '@open-wc/testing';
import { MBagAddPage } from './index';

describe('MBagAddPage', () => {
  it('should be defined', () => {
    expect(MBagAddPage).to.exist;
  });

  it('should have the correct tag name', () => {
    expect(MBagAddPage.tagName).to.equal('m-bag-add-page');
  });
});
