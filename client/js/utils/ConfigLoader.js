/**
 * ConfigLoader.js - Loads leedz_config.json merged with LLM_KEY.json
 * Single source of truth for config loading across parsers and utilities.
 * Caches result so the fetch only happens once per context.
 */

let _cachedConfig = null;

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
  return _cachedConfig;
}
