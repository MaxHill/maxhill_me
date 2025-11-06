import MCard from './m-card';
import MCopyButton from './m-copy-button';
import { MSearchList } from './m-search-list';
import MFitText from './m-fit-text';
import {MTabList, MTab, MTabPanel} from './m-tabs/';

export function registerAll() {
  MCard.define();
  MCopyButton.define();
  MFitText.define();

  MTabList.define();
  MTab.define();
  MTabPanel.define();

  MSearchList.define();
}

registerAll();
