import MCard from './m-card';
import MFitText from './m-fit-text';
import { TabContainerElement } from './vendored/tab-container-element/tab-container-element';

export function registerAll() {
  MCard.define();
  MFitText.define();
  TabContainerElement.define();
}

registerAll();
