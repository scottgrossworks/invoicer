/**
 * ConfigLoader.js - Loads leedz_config.json merged with LLM_KEY.json
 * Single source of truth for config loading across parsers and utilities.
 * Caches result so the fetch only happens once per context.
 */

let _cachedConfig = null;

import { showToast } from '../logging.js';

/**
 * Load leedz_config.json and inject the api-key from LLM_KEY.json.
 * @returns {Promise<Object>} Merged config object
 */
export async function loadConfig() {
  if (_cachedConfig) return _cachedConfig;
  const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
  if (!configResponse.ok) throw new Error(`Failed to load leedz_config.json: ${configResponse.status}`);
  _cachedConfig = await configResponse.json();
  try {
    const keyResponse = await fetch(chrome.runtime.getURL('LLM_KEY.json'));
    if (keyResponse.ok) {
      const keyData = await keyResponse.json();
      if (keyData['api-key']) _cachedConfig.llm['api-key'] = keyData['api-key'];
    }
  } catch (e) { /* LLM_KEY.json missing — api-key stays undefined */ }

  // Fail LOUD and EARLY on a missing/placeholder key: every LLM call would
  // 401 into a blank parse that looks like an extraction bug (2026-08-04).
  const key = _cachedConfig?.llm?.['api-key'];
  if (!key || /PASTE|YOUR.?KEY/i.test(key)) {
    showToast('No LLM API key configured - paste your key into LLM_KEY.json, then reload the extension.', 'error');
  }

  // Distributed leedz_config.json ships with llm.provider BLANK on purpose -
  // every installer picks their own model. Catch that here, once, with a
  // clear pointer, instead of letting each parser hit a raw 400 from the
  // provider (2026-08-11).
  if (!_cachedConfig?.llm?.provider) {
    showToast('No LLM model chosen - set llm.provider in leedz_config.json (e.g. an OpenRouter model id), then reload.', 'error');
  }

  return _cachedConfig;
}
