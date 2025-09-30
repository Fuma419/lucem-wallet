import * as wasm from '@emurgo/cardano-serialization-lib-browser';
import * as wasm2 from '../wasm/cardano_message_signing/cardano_message_signing.generated';

/**
 * Loads the WASM modules
 */

class Loader {
  _wasm = wasm;
  _loadingPromise = null;

  /**
   * Instantiate message signing library.
   * Loader.Cardano is loaded synchronously and does not require async instantiation.
   * Added caching to prevent multiple simultaneous loads.
   */
  async load() {
    if (this._wasm2) return;
    
    // If already loading, return the existing promise
    if (this._loadingPromise) {
      return this._loadingPromise;
    }
    
    this._loadingPromise = this._doLoad();
    return this._loadingPromise;
  }
  
  async _doLoad() {
    try {
      await wasm2.instantiate();
    } catch (_e) {
      // Only happens when running with Jest (Node.js)
    }

    /**
     * @private
     */
    this._wasm2 = wasm2;
    this._loadingPromise = null; // Reset the promise cache
  }

  get Cardano() {
    return this._wasm;
  }

  get Message() {
    return this._wasm2;
  }
}

export default new Loader();
