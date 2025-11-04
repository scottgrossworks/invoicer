/**
 * Provider Registry - Centralized configuration loader and provider factory
 * 
 * This module serves as the main dependency injection system for the Leedz Invoicer extension.
 * It loads configuration from invoicer_config.json and creates appropriate provider instances
 * for database operations, LLM interactions, rendering, and email parsing.
 * 
 * Used by: 
 * - sidebar.js (main application logic)
 * 
 * Dependencies:
 * - invoicer_config.json (configuration file)
 * - ./db/DB_local_prisma_sqlite.js (database provider)
 * - ./render/PDF_render.js (PDF rendering provider)
 * - Various parser modules (email parsing providers)
 */

/**
 * Loads the main configuration file for the extension
 *
 * Attempts to fetch leedz_config.json from the extension's root directory.
 * If the config file is missing or corrupted, returns sensible defaults for local development.
 *
 * @returns {Promise<Object>} Configuration object with llm, db, render, and parsers sections
 * @throws {Error} Never throws - always returns valid config (defaults if needed)
 *
 * Used by: All other functions in this module
 *
 * Default fallback configuration:
 * - LLM: localhost:1234 (typical local LLM server)
 * - Database: localhost:3333 with SQLite provider
 */
export async function loadConfig() {
  try {
    const res = await fetch(chrome.runtime.getURL('leedz_config.json'));
    if (!res.ok) throw new Error('Config fetch failed');
    return await res.json();
  } catch (e) {
    // Return sensible defaults if config loading fails
    return {
      llm: { baseUrl: 'http://localhost:1234' },
      db: { baseUrl: 'http://localhost:3333', provider: 'local_prisma_sqlite' }
    };
  }
}

/**
 * Creates and returns the configured database layer instance
 *
 * Factory function that reads the database provider configuration and instantiates
 * the appropriate database layer class. Currently only supports local SQLite via Prisma.
 *
 * Priority order for configuration:
 * 1. Chrome storage (leedzStartupConfig) - user-configured via Startup page
 * 2. leedz_config.json - default fallback configuration
 *
 * @returns {Promise<DB_Local_PrismaSqlite>} Database layer instance for CRUD operations
 * @throws {Error} If unknown database provider is specified in config
 *
 * Used by:
 * - sidebar.js:569 (for saving booking data)
 *
 * Supported providers:
 * - 'local_prisma_sqlite': Uses DB_local_prisma_sqlite.js with local SQLite database
 */
export async function getDbLayer() {
  // First check Chrome storage for user-configured startup settings
  let baseUrl = null;
  let provider = 'local_prisma_sqlite';

  try {
    const storageResult = await chrome.storage.local.get('leedzStartupConfig');
    if (storageResult.leedzStartupConfig) {
      const startupConfig = storageResult.leedzStartupConfig;
      if (startupConfig.serverUrl && startupConfig.serverPort) {
        baseUrl = `${startupConfig.serverUrl}:${startupConfig.serverPort}`;
        provider = startupConfig.dbProvider || 'local_prisma_sqlite';
        console.log('Using startup config from Chrome storage:', baseUrl);
      }
    }
  } catch (error) {
    console.warn('Failed to load startup config from Chrome storage:', error);
  }

  // Fall back to leedz_config.json if no startup config found
  if (!baseUrl) {
    const cfg = await loadConfig();
    baseUrl = cfg?.db?.baseUrl || 'http://localhost:3000';
    provider = cfg?.db?.provider || 'local_prisma_sqlite';
    console.log('Using default config from leedz_config.json:', baseUrl);
  }

  // Create DB layer instance
  if (provider === 'local_prisma_sqlite') {
    const module = await import('./db/DB_local_prisma_sqlite.js');
    return new module.DB_Local_PrismaSqlite(baseUrl);
  }
  throw new Error('Unknown DB provider: ' + provider);
}

/**
 * Returns the LLM (Large Language Model) configuration
 * 
 * Extracts LLM settings from the main config for use by email parsers.
 * The LLM is used to parse email content and extract booking information.
 * 
 * @returns {Promise<Object>} LLM configuration object with baseUrl and other settings
 * 
 * Used by: 
 * - Email parser modules (indirectly through configuration)
 * 
 * Typical configuration:
 * - baseUrl: URL of the LLM API endpoint (e.g., 'http://localhost:1234')
 * - Additional model-specific settings (temperature, max_tokens, etc.)
 */
export async function getLlmConfig() {
  const cfg = await loadConfig();
  return cfg.llm || { baseUrl: 'http://localhost:1234' };
}

/**
 * Creates and returns the configured rendering engine instance
 * 
 * Factory function for document rendering providers. Currently supports PDF generation
 * for creating invoice documents from booking data.
 * 
 * @returns {Promise<PDFRender>} Rendering engine instance for generating documents
 * @throws {Error} If unknown render provider is specified in config
 * 
 * Used by:
 * - sidebar.js:581 (for generating PDF invoices)
 * 
 * Supported providers:
 * - 'pdf': Uses PDF_render.js for PDF document generation
 */
export async function getRenderer() {
  const cfg = await loadConfig();
  const provider = cfg?.render?.provider || 'pdf';
  if (provider === 'pdf') {
    const mod = await import('./render/PDF_render.js');
    return new mod.PDFRender(cfg);
  }
  throw new Error('Unknown render provider: ' + provider);
}

/**
 * Creates and returns all configured email parser instances
 * 
 * Factory function that dynamically loads and instantiates email parser modules
 * based on the configuration. Each parser is responsible for extracting booking
 * information from specific email formats (Gmail, Outlook, etc.).
 * 
 * @returns {Promise<Array>} Array of parser instances ready for email processing
 * 
 * Used by:
 * - sidebar.js:79 (for parsing email content into booking data)
 * 
 * Parser loading strategy:
 * 1. Iterates through cfg.parsers array from config
 * 2. Dynamically imports each parser module
 * 3. Attempts multiple export patterns (default, named, Parser class)
 * 4. Silently skips parsers that fail to load (graceful degradation)
 * 5. Returns array of successfully loaded parser instances
 * 
 * Configuration format:
 * "parsers": [
 *   { "name": "GmailParser", "module": "js/parser/gmail_parser.js" }
 * ]
 */
export async function getParsers() {
  const cfg = await loadConfig();
  const entries = cfg.parsers || [];
  const instances = [];
  for (const entry of entries) {
    try {
      const mod = await import(chrome.runtime.getURL(entry.module));
      // Accept default export or named export patterns
      const ParserCtor = mod.default || mod[entry.name] || mod.Parser || null;
      if (ParserCtor) {
        instances.push(new ParserCtor());
      }
    } catch (e) {
      // Silently skip failed parser loads to ensure other parsers still work
      console.warn(`Failed to load parser from ${entry.module}:`, e);
    }
  }
  return instances;
}


