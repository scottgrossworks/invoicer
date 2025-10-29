/**
 * ClientParser - Generic parser for extracting multiple Client objects from any web page
 *
 * TWO-PHASE EXTRACTION:
 * 1. Procedural DOM extraction - Parse obvious structured data from page
 * 2. LLM fallback - Process remaining unfilled fields via LLM
 *
 * SCHEMA TARGET: Client { name, email, phone, company, clientNotes }
 *
 * USE CASES:
 * - California School Directory pages (initial)
 * - LinkedIn profile pages
 * - Company "About Us" / "Team" pages
 * - Conference attendee lists
 * - Any page with contact information
 */

import { PortalParser } from './parser.js';
import Client from '../db/Client.js';

// Global CONFIG variable
let CONFIG = null;

class ClientParser extends PortalParser {

  constructor() {
    super();
    this.STATE = null;
    this.name = 'ClientParser';
  }

  /**
   * Initialize config from leedz_config.json
   */
  async _initializeConfig() {
    if (CONFIG) return;
    try {
      const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
      if (!configResponse.ok) throw new Error(`Config file not found: ${configResponse.status}`);
      CONFIG = await configResponse.json();
      console.log('Client parser config loaded successfully');
    } catch (error) {
      console.error('FATAL: Unable to load leedz_config.json:', error);
      throw new Error('Client parser cannot initialize - config file missing or invalid');
    }
  }

  /**
   * Check if this parser matches the current page
   * For now, return false - parser will be manually triggered from ClientCapture page
   * Future: could check for specific domains or page patterns
   */
  async checkPageMatch(url) {
    // Manual trigger only for now
    return false;
  }

  /**
   * Initialize parser with state
   */
  async initialize(state) {
    await this._initializeConfig();
    this.STATE = state;
  }

  /**
   * Main parse method - orchestrates two-phase extraction
   * Returns array of Client objects
   */
  async parse(state) {
    try {
      if (state) {
        this.STATE = state;
      }

      console.log('ClientParser: Starting extraction...');

      // PHASE 1: Procedural DOM extraction
      const proceduralResult = this._proceduralExtraction();
      console.log(`ClientParser: Procedural extraction found ${proceduralResult.clients.length} clients`);

      // Check if we need LLM processing
      const needsLLM = this._needsLLMProcessing(proceduralResult);

      if (needsLLM && CONFIG?.clientParser?.enableLLM) {
        console.log('ClientParser: Invoking LLM for additional extraction...');

        // PHASE 2: LLM processing
        const llmClients = await this._llmExtraction(proceduralResult);

        if (llmClients && llmClients.length > 0) {
          console.log(`ClientParser: LLM extraction found ${llmClients.length} clients`);
          // Merge results - procedural takes precedence
          proceduralResult.clients = this._mergeResults(proceduralResult.clients, llmClients);
        }
      }

      // Validate and clean all clients
      const validClients = this._validateAndClean(proceduralResult.clients);
      console.log(`ClientParser: Returning ${validClients.length} valid clients`);

      return { clients: validClients };

    } catch (error) {
      console.error('ClientParser: Parse failed:', error);
      return { clients: [] };
    }
  }

  /**
   * PHASE 1: Procedural DOM extraction
   * Extract obvious structured data using multiple selector strategies
   */
  _proceduralExtraction() {
    const clients = [];
    const extractedData = {};

    // Strategy 1: Extract by common label patterns
    const fieldMappings = [
      // Name patterns
      { labels: ['name', 'full name', 'contact name', 'administrator', 'director', 'custodian', 'principal'], field: 'name' },

      // Email patterns
      { labels: ['email', 'e-mail', 'email address', 'contact email'], field: 'email' },

      // Phone patterns
      { labels: ['phone', 'telephone', 'phone number', 'tel', 'contact number'], field: 'phone' },

      // Company patterns
      { labels: ['company', 'organization', 'school', 'institution', 'business'], field: 'company' },

      // Address/web patterns (go to clientNotes)
      { labels: ['address', 'location', 'mailing address', 'school address', 'street address'], field: 'address' },
      { labels: ['website', 'web address', 'url', 'web'], field: 'website' },
      { labels: ['fax', 'fax number'], field: 'fax' }
    ];

    // Extract all fields
    for (const mapping of fieldMappings) {
      for (const label of mapping.labels) {
        const value = this._extractByLabel(label);
        if (value && value !== 'Information Not Available') {
          if (!extractedData[mapping.field]) {
            extractedData[mapping.field] = value;
            console.log(`Found ${mapping.field}: ${value.substring(0, 50)}...`);
            break; // Found value for this field, move to next
          }
        }
      }
    }

    // Strategy 2: Look for multiple contact sections (Administrator, Custodian, etc.)
    const contactSections = this._findContactSections();

    if (contactSections.length > 0) {
      // Multiple contacts found - extract each
      for (const section of contactSections) {
        const client = this._extractClientFromSection(section, extractedData);
        if (client && client.name) {
          clients.push(client);
        }
      }
    } else {
      // No sections - create single client from extracted data
      if (extractedData.name || extractedData.email) {
        const client = this._buildClientObject(extractedData);
        clients.push(client);
      }
    }

    return {
      clients: clients,
      unfilled: this._getUnfilledFields(clients),
      baseData: extractedData // Keep for LLM context
    };
  }

  /**
   * Extract text by label using multiple selector strategies
   */
  _extractByLabel(label) {
    const normalizedLabel = label.toLowerCase();

    // Strategy 1: Label element + sibling
    const labels = Array.from(document.querySelectorAll('label, th, td, dt, span, div'));
    for (const labelEl of labels) {
      const text = labelEl.textContent.toLowerCase().trim();
      if (text === normalizedLabel || text === normalizedLabel + ':') {
        // Check next sibling
        let sibling = labelEl.nextElementSibling;
        if (sibling && sibling.textContent.trim()) {
          return sibling.textContent.trim();
        }

        // Check parent's next sibling
        const parent = labelEl.parentElement;
        if (parent) {
          sibling = parent.nextElementSibling;
          if (sibling && sibling.textContent.trim()) {
            return sibling.textContent.trim();
          }
        }
      }
    }

    // Strategy 2: Table rows (th/td pairs)
    const rows = Array.from(document.querySelectorAll('tr'));
    for (const row of rows) {
      const cells = row.querySelectorAll('th, td');
      if (cells.length >= 2) {
        const firstCell = cells[0].textContent.toLowerCase().trim();
        if (firstCell === normalizedLabel || firstCell === normalizedLabel + ':') {
          return cells[1].textContent.trim();
        }
      }
    }

    // Strategy 3: Definition lists
    const dts = Array.from(document.querySelectorAll('dt'));
    for (const dt of dts) {
      const text = dt.textContent.toLowerCase().trim();
      if (text === normalizedLabel || text === normalizedLabel + ':') {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          return dd.textContent.trim();
        }
      }
    }

    // Strategy 4: aria-label
    const ariaElements = Array.from(document.querySelectorAll(`[aria-label*="${normalizedLabel}"]`));
    if (ariaElements.length > 0) {
      return ariaElements[0].textContent.trim() || ariaElements[0].value;
    }

    return null;
  }

  /**
   * Find sections that might contain individual contacts
   * Look for repeated patterns with person names/roles
   */
  _findContactSections() {
    const sections = [];
    const seenSections = new Set(); // Track DOM elements we've already processed

    // Look for common role labels that indicate person contacts
    const roleLabels = ['administrator', 'director', 'custodian', 'principal', 'contact', 'manager'];

    // Regex patterns for validation
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const namePattern = /\b[A-Z][a-z]+\.?\s+[A-Z][a-z]+/; // "John Doe" or "Mr. Smith"

    for (const roleLabel of roleLabels) {
      const elements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent.toLowerCase();
        return text.includes(roleLabel) && el.children.length < 10; // Not a container
      });

      for (const el of elements) {
        // Get surrounding context (parent or nearby elements)
        const section = el.closest('tr, div, section, article') || el.parentElement;

        if (!section || seenSections.has(section)) {
          continue; // Already processed this section
        }

        // Validate: section must contain BOTH a name pattern AND an email
        const sectionText = section.textContent;
        const hasEmail = emailPattern.test(sectionText);
        const hasName = namePattern.test(sectionText);

        if (hasEmail && hasName) {
          seenSections.add(section);
          sections.push({
            element: section,
            role: roleLabel
          });
        }
      }
    }

    return sections;
  }

  /**
   * Extract client data from a section element
   */
  _extractClientFromSection(section, baseData) {
    const sectionText = section.element.textContent;

    const clientData = { ...baseData };

    // Extract name (look for person name pattern) - sanitization happens in _buildClientObject
    const nameMatch = sectionText.match(/([A-Z][a-z]+\.?\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?)/);
    if (nameMatch) {
      clientData.name = nameMatch[0].trim();
    }

    // Extract email (look for email pattern in section)
    const emailMatch = sectionText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      clientData.email = emailMatch[0];
    }

    // Extract phone (look for phone pattern in section) - sanitized by sanitizePhone
    const phoneMatch = sectionText.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
    if (phoneMatch) {
      clientData.phone = phoneMatch[0]; // Will be sanitized in _buildClientObject
    }

    // Add role to clientNotes
    if (section.role) {
      clientData.role = section.role;
    }

    return this._buildClientObject(clientData);
  }

  /**
   * Build Client object from extracted data
   */
  _buildClientObject(data) {
    const client = {
      name: this._sanitizeName(data.name) || null,
      email: data.email || null,
      phone: data.phone ? this.sanitizePhone(data.phone) : null,
      company: data.company || null,
      website: data.website || null,
      clientNotes: ''
    };

    // Build clientNotes from additional info
    const notes = [];
    if (data.role) notes.push(data.role.charAt(0).toUpperCase() + data.role.slice(1));
    if (data.address) notes.push(data.address);
    if (data.fax) notes.push(`Fax: ${data.fax}`);

    client.clientNotes = this._sanitizeClientNotes(notes.join('\n'));

    return client;
  }

  /**
   * Sanitize name: remove Mr./Mrs./Ms./Dr. prefixes, handle lastname,firstname format
   */
  _sanitizeName(name) {
    if (!name) return name;

    let cleaned = name.trim();

    // Remove honorifics
    cleaned = cleaned.replace(/^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Miss)\s+/i, '');

    // Handle "Lastname, Firstname" format -> "Firstname Lastname"
    if (cleaned.includes(',')) {
      const parts = cleaned.split(',').map(p => p.trim());
      if (parts.length === 2) {
        cleaned = `${parts[1]} ${parts[0]}`;
      }
    }

    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Sanitize clientNotes: trim lines, remove excessive spaces, clean up formatting
   */
  _sanitizeClientNotes(notes) {
    if (!notes) return '';

    // Split by newlines, trim each line, remove empty lines
    const lines = notes.split('\n')
      .map(line => line.trim().replace(/\s+/g, ' ')) // Remove multiple spaces within lines
      .filter(line => line.length > 0); // Remove empty lines

    return lines.join('\n');
  }

  /**
   * Determine if LLM processing is needed
   */
  _needsLLMProcessing(proceduralResult) {
    // Need LLM if no clients found
    if (proceduralResult.clients.length === 0) return true;

    // Need LLM if any client is missing required name
    for (const client of proceduralResult.clients) {
      if (!client.name || !client.name.trim()) return true;
    }

    // Need LLM if critical fields are missing
    const hasEmail = proceduralResult.clients.some(c => c.email);
    if (!hasEmail) return true;

    return false;
  }

  /**
   * Get list of unfilled fields across all clients
   */
  _getUnfilledFields(clients) {
    const unfilled = new Set();

    for (const client of clients) {
      if (!client.name) unfilled.add('name');
      if (!client.email) unfilled.add('email');
      if (!client.phone) unfilled.add('phone');
      if (!client.company) unfilled.add('company');
    }

    return Array.from(unfilled);
  }

  /**
   * PHASE 2: LLM extraction
   * Trim page source and send to LLM for additional extraction
   */
  async _llmExtraction(proceduralResult) {
    try {
      // Trim page source
      const trimmedContent = this._trimPageForLLM();

      if (!trimmedContent || trimmedContent.length < 50) {
        console.log('ClientParser: Not enough content for LLM processing');
        return null;
      }

      // Build prompt
      const systemPrompt = CONFIG.clientParser.systemPrompt;
      const userPrompt = `Extract client contact information from this page content:\n\n${trimmedContent}`;

      // Call LLM
      const llmConfig = CONFIG.llm;
      const response = await fetch(`${llmConfig.baseUrl}${llmConfig.endpoints.completions}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': llmConfig['api-key'],
          'anthropic-version': llmConfig['anthropic-version']
        },
        body: JSON.stringify({
          model: llmConfig.provider,
          max_tokens: llmConfig.max_tokens || 2048,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: userPrompt
          }]
        })
      });

      if (!response.ok) {
        console.error('LLM request failed:', response.status);
        return null;
      }

      const result = await response.json();
      const content = result.content?.[0]?.text;

      if (!content) {
        console.log('LLM returned no content');
        return null;
      }

      // Parse JSON response
      const clients = this._parseLLMResponse(content);
      return clients;

    } catch (error) {
      console.error('LLM extraction failed:', error);
      return null;
    }
  }

  /**
   * Trim page source for LLM processing
   */
  _trimPageForLLM() {
    // Clone document to avoid modifying original
    const clone = document.body.cloneNode(true);

    // Remove scripts, styles, svg, images
    ['script', 'style', 'svg', 'img', 'iframe', 'video'].forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });

    // Remove navigation, headers, footers
    ['nav', 'header', 'footer', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'].forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Get text content
    let text = clone.textContent || '';

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Limit to 5000 chars
    if (text.length > 5000) {
      text = text.substring(0, 5000);
    }

    return text;
  }

  /**
   * Parse LLM JSON response
   */
  _parseLLMResponse(content) {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log('No JSON array found in LLM response');
        return null;
      }

      const clients = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(clients)) {
        console.log('LLM response is not an array');
        return null;
      }

      return clients;

    } catch (error) {
      console.error('Failed to parse LLM JSON response:', error);
      return null;
    }
  }

  /**
   * Merge procedural and LLM results
   * Procedural data takes precedence
   */
  _mergeResults(proceduralClients, llmClients) {
    const merged = [...proceduralClients];

    // Add LLM clients that don't conflict with procedural ones
    for (const llmClient of llmClients) {
      // Check if this client already exists (by name or email)
      const exists = merged.some(c =>
        (c.name && c.name === llmClient.name) ||
        (c.email && c.email === llmClient.email)
      );

      if (!exists && llmClient.name) {
        merged.push(llmClient);
      }
    }

    return merged;
  }

  /**
   * Validate and clean all clients
   */
  _validateAndClean(clients) {
    const valid = [];
    const seenEmails = new Set();

    for (const clientData of clients) {
      // Validate using Client.js
      const validation = Client.validate(clientData);

      if (!validation.isValid) {
        // Silent skip - validation failed
        continue;
      }

      // Handle email uniqueness
      if (clientData.email) {
        if (seenEmails.has(clientData.email)) {
          // Silent skip - duplicate email
          continue; // Skip duplicate
        } else {
          seenEmails.add(clientData.email);
        }
      }

      valid.push(clientData);
    }

    return valid;
  }
}

// Export for use in content scripts
export default ClientParser;
