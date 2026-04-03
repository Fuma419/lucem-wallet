import extensionAdapter from './extension';
import webAdapter from './web';

const isExtension =
  typeof chrome !== 'undefined' &&
  typeof chrome.runtime !== 'undefined' &&
  typeof chrome.runtime.id !== 'undefined';

const platform = isExtension ? extensionAdapter : webAdapter;

export default platform;
