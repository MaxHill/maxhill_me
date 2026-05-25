import { expect } from '@open-wc/testing';
import { MBagListPage } from './index';

describe('MBagListPage', () => {
  it('should be defined', () => {
    expect(MBagListPage).to.exist;
  });

  it('should have the correct tag name', () => {
    expect(MBagListPage.tagName).to.equal('m-bag-list-page');
  });
});
