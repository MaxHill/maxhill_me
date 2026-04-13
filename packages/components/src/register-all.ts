import MCard from './m-card';
import MInput from './m-input';
import MTextarea from './m-textarea';
import MCombobox from './m-combobox';
import MCommandPalette from './m-command-palette';
import MCommand from './m-command';
import MCopyButton from './m-copy-button';
import { MSearchList } from './m-search-list';
import MFitText from './m-fit-text';
import MTabList from './m-tab-list';
import MTab from './m-tab';
import MTabPanel from './m-tab-panel';
import MListbox from './m-listbox';
import MOption from './m-option';
import MPopoverMenu from './m-popover-menu';

export function registerAll() {
  MCard.define();
  MCopyButton.define();
  MFitText.define();

  MTabList.define();
  MTab.define();
  MTabPanel.define();

  MSearchList.define();

  MCommand.define();
  MCommandPalette.define();

  MPopoverMenu.define();

  // Form
  MInput.define();
  MTextarea.define();
  MListbox.define();
  MOption.define();
  MCombobox.define();
}

registerAll();
