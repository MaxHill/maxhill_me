import MCard from './m-card';
import MCopyButton from './m-copy-button';
import { MFilter } from './m-filter';
import MFitText from './m-fit-text';
import {MTabList, MTab, MTabPanel} from './m-tabs/';

export function registerAll() {
  MCard.define();
  MCopyButton.define();
  MFitText.define();

  MTabList.define();
  MTab.define();
  MTabPanel.define();

  MFilter.define();
}

registerAll();
