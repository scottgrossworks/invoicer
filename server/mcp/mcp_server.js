/**
 * ==============================================================================
 * LEEDZ - MCP SERVER
 * ==============================================================================
 * 
 * Model Context Protocol server that bridges natural language requests 
 * from LLM clients (like Claude Desktop) to HTTP API calls against the 
 * Leedz invoicing database server.
 * 
 * ARCHITECTURE:
 * 1. Receives JSON-RPC messages via stdin
 * 2. Extracts natural language requests 
 * 3. Sends requests to Claude API for translation to structured HTTP calls
 * 4. Executes HTTP calls against local database server
 * 5. Returns formatted responses via stdout
 * 
 * @author Scott Gross
 * @version 2.0.0
 */

const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==============================================================================
// CONFIGURATION AND GLOBALS
// ==============================================================================

// Load configuration from JSON file - resolve relative to script location
const CONFIG_PATH = path.resolve(__dirname, 'mcp_server_config.json');
console.error(`[MCP] Loading config from: ${CONFIG_PATH}`);

let config;
try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.error(`[MCP] Config loaded successfully`);
} catch (error) {
    console.error(`[MCP] FATAL: Failed to load config: ${error.message}`);
    process.exit(1);
}

// Fetch API key from database Config at startup
let dbApiKey = null;
(async () => {
    try {
        const dbConfigUrl = `${config.database.apiUrl}/config`;
        const response = await axios.get(dbConfigUrl);
        if (response.data && response.data.llmApiKey) {
            dbApiKey = response.data.llmApiKey;
            console.error(`[MCP] Using API key from database Config`);
        }
    } catch (error) {
        console.error(`[MCP] Could not fetch API key from database, using config file: ${error.message}`);
    }
})();

// System prompt for Claude API - defines available endpoints and response format
const SYSTEM_PROMPT = config.llm.systemPrompt;

// ==============================================================================
// LOGGING UTILITIES
// ==============================================================================

/**
 * Resolve the absolute path for log file
 * Ensures logs are written to server root directory
 */
function getLogFilePath() {
    const configuredPath = config.logging?.file || './mcp_server.log';
    return path.resolve(__dirname, configuredPath);
}

const LOG_FILE_PATH = getLogFilePath();

// Ensure log directory exists
try {
    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
} catch (error) {
    // Directory may already exist
}

/**
 * Write log entry to file with timestamp
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Message to log
 */
function writeLogEntry(level, message) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    
    try {
        fs.appendFileSync(LOG_FILE_PATH, entry);
    } catch (error) {
        console.error('Failed to write log file:', error.message);
    }
    
    // Only show warnings and errors on stderr to avoid cluttering client UI
    if (level === 'error' || level === 'warn') {
        console.error(entry.trim());
    }
}

// Convenient logging functions
const logDebug = (message) => writeLogEntry('debug', message);
const logInfo = (message) => writeLogEntry('info', message);
const logWarn = (message) => writeLogEntry('warn', message);
const logError = (message) => writeLogEntry('error', message);

// ==============================================================================
// JSON EXTRACTION UTILITIES
// ==============================================================================

/**
 * Check if text looks like JSON (starts with { or [)
 * @param {string} text - Text to check
 * @returns {boolean} True if text appears to be JSON
 */
function looksLikeJson(text) {
    const trimmed = text.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/**
 * Check if text is pure JSON (starts and ends with matching brackets)
 * @param {string} text - Text to check
 * @returns {boolean} True if text is pure JSON
 */
function isPureJson(text) {
    const trimmed = text.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

/**
 * Extract JSON from code fence blocks (```json ... ``` or ``` ... ```)
 * @param {string} text - Text containing code fences
 * @returns {string|null} Extracted JSON or null if not found
 */
function extractFromCodeFence(text) {
    const fenceMatch = text.match(/```json[\s\S]*?```/i) || text.match(/```[\s\S]*?```/);
    
    if (!fenceMatch) return null;
    
    const inner = fenceMatch[0]
        .replace(/```json/i, '```')
        .replace(/```/g, '')
        .trim();
    
    if (!looksLikeJson(inner)) return null;
    
    const startChar = inner.includes('{') ? '{' : '[';
    return inner.substring(inner.indexOf(startChar));
}

/**
 * Find the first JSON object or array in text by balancing brackets
 * @param {string} text - Text to search
 * @returns {string|null} Extracted JSON or null if not found
 */
function findFirstJsonBlock(text) {
    // Find the first opening bracket
    let startIndex = -1;
    let openChar = '';
    
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{' || text[i] === '[') {
            startIndex = i;
            openChar = text[i];
            break;
        }
    }
    
    if (startIndex === -1) return null;
    
    // Find matching closing bracket by counting depth
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0;
    
    for (let i = startIndex; i < text.length; i++) {
        if (text[i] === openChar) depth++;
        if (text[i] === closeChar) depth--;
        
        if (depth === 0) {
            return text.substring(startIndex, i + 1);
        }
    }
    
    return null;
}

/**
 * Extract the first valid JSON string from text using multiple strategies
 * @param {string} text - Text that may contain JSON
 * @returns {string|null} Extracted JSON string or null if not found
 */
function extractJsonString(text) {
    if (!text || !text.trim()) return null;
    
    const trimmed = text.trim();
    
    // Strategy 1: Already pure JSON
    if (isPureJson(trimmed)) {
        return trimmed;
    }
    
    // Strategy 2: Try code fence extraction
    const fromFence = extractFromCodeFence(trimmed);
    if (fromFence) return fromFence;
    
    // Strategy 3: Find first JSON block by bracket balancing
    return findFirstJsonBlock(trimmed);
}

// ==============================================================================
// CLAUDE API UTILITIES
// ==============================================================================

/**
 * Build headers for Claude API request
 * @returns {Object} Headers object for axios request
 */
function buildClaudeHeaders() {
    // Use database API key if available, otherwise fall back to config file
    const apiKey = dbApiKey || config.llm['api-key'];
    return {
        'x-api-key': apiKey,
        'anthropic-version': config.llm['anthropic-version'],
        'content-type': 'application/json'
    };
}

/**
 * Build request body for Claude API
 * @param {string} userMessage - User's natural language request
 * @returns {Object} Request body for Claude API
 */
function buildClaudeRequestBody(userMessage) {
    return {
        model: config.llm.provider,
        max_tokens: config.llm.max_tokens,
        system: SYSTEM_PROMPT,
        messages: [
            { role: 'user', content: userMessage }
        ]
    };
}

/**
 * Extract content text from Claude API response
 * @param {Object} responseData - Claude API response data
 * @returns {string} Extracted content text
 */
function extractClaudeContent(responseData) {
    return responseData.content?.[0]?.text || '';
}

/**
 * Send request to Claude API and get structured response
 * @param {string} userMessage - User's natural language request
 * @returns {Object|null} Parsed JSON response or null if failed
 */
async function translateWithClaude(userMessage) {
    try {
        const claudeUrl = `${config.llm.baseUrl}${config.llm.endpoints.completions}`;
        const headers = buildClaudeHeaders();
        const body = buildClaudeRequestBody(userMessage);
        
        logDebug(`Sending request to Claude: ${userMessage.substring(0, 100)}...`);
        
        const response = await axios.post(claudeUrl, body, {
            headers: headers,
            timeout: 30000
        });
        
        const content = extractClaudeContent(response.data);
        logDebug(`Claude response: ${content.substring(0, 200)}...`);
        
        return parseClaudeResponse(content);
        
    } catch (error) {
        logError(`Claude API error: ${error.message}`);
        return null;
    }
}

/**
 * Parse Claude's response text to extract JSON
 * @param {string} content - Raw response content from Claude
 * @returns {Object|null} Parsed JSON object or null if failed
 */
function parseClaudeResponse(content) {
    const jsonString = extractJsonString(content);
    
    if (!jsonString) {
        logWarn('No JSON found in Claude response');
        return null;
    }
    
    try {
        const parsed = JSON.parse(jsonString);
        logInfo('Successfully parsed Claude response');
        return parsed;
    } catch (error) {
        logWarn(`Failed to parse JSON: ${error.message}`);
        return null;
    }
}

// ==============================================================================
// HTTP API UTILITIES
// ==============================================================================

/**
 * Execute HTTP request against the database API server
 * @param {Object} action - Action object with method, endpoint, and data
 * @returns {Object} Response data from API server
 */
async function executeHttpRequest(action) {
    const { method, endpoint, data } = action;
    const url = `${config.database.apiUrl}${endpoint}`;
    
    logInfo(`Executing ${method} ${endpoint}`);
    
    try {
        const response = await axios({
            method: method.toLowerCase(),
            url: url,
            data: method === 'GET' ? undefined : data,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        logInfo(`HTTP request successful: ${response.status}`);
        return response.data;
        
    } catch (error) {
        const errorMsg = error.response 
            ? `HTTP ${error.response.status}: ${error.response.data.error || 'Request failed'}`
            : 'Network error';
        
        logError(`HTTP request failed: ${errorMsg}`);
        throw new Error(errorMsg);
    }
}

/**
 * Format response data for display to user
 * @param {Object} result - Response data from API
 * @param {Object} action - Original action object
 * @returns {string} Formatted response string
 */
function formatApiResponse(result, action) {
    const { method, endpoint, description } = action;
    
    // Format based on HTTP method
    switch (method.toUpperCase()) {
        case 'GET':
            return formatGetResponse(result, endpoint, description);
        case 'POST':
            return `✅ ${description}\n\nCreated successfully:\n${JSON.stringify(result, null, 2)}`;
        case 'PUT':
            return `🔄 ${description}\n\nUpdated successfully:\n${JSON.stringify(result, null, 2)}`;
        case 'DELETE':
            return `🗑️ ${description}\n\nDeleted successfully`;
        default:
            return `✅ ${description}\n\n${JSON.stringify(result, null, 2)}`;
    }
}

/**
 * Format GET response based on content type
 * @param {Object|Array} result - Response data
 * @param {string} endpoint - API endpoint
 * @param {string} description - Action description
 * @returns {string} Formatted response
 */
function formatGetResponse(result, endpoint, description) {
    if (endpoint.includes('/stats')) {
        return `📊 ${description}\n\n${JSON.stringify(result, null, 2)}`;
    }
    
    if (Array.isArray(result)) {
        return `📋 ${description}\n\nFound ${result.length} items:\n${JSON.stringify(result, null, 2)}`;
    }
    
    return `📄 ${description}\n\n${JSON.stringify(result, null, 2)}`;
}

// ==============================================================================
// JSON-RPC RESPONSE UTILITIES
// ==============================================================================

/**
 * Create successful JSON-RPC response
 * @param {string} id - Request ID
 * @param {string} text - Response text to send
 * @returns {Object} JSON-RPC response object
 */
function createSuccessResponse(id, text) {
    return {
        jsonrpc: '2.0',
        id: id,
        result: {
            content: [{
                type: 'text',
                text: text
            }]
        }
    };
}

/**
 * Create JSON-RPC error response
 * @param {string} id - Request ID
 * @param {number} code - Error code
 * @param {string} message - Error message
 * @returns {Object} JSON-RPC error response
 */
function createErrorResponse(id, code, message) {
    return {
        jsonrpc: '2.0',
        id: id,
        error: {
            code: code,
            message: message
        }
    };
}

/**
 * Send JSON-RPC response to stdout
 * @param {Object} response - Response object to send
 */
function sendJsonRpcResponse(response) {
    process.stdout.write(JSON.stringify(response) + '\n');
}

// ==============================================================================
// MCP PROTOCOL HANDLERS
// ==============================================================================

/**
 * Handle MCP initialization request
 * @param {string} id - Request ID
 * @returns {Object} Initialization response
 */
function handleInitialize(id) {
    logInfo('Handling MCP initialize request');
    
    return {
        jsonrpc: '2.0',
        id: id,
        result: {
            protocolVersion: "2025-06-18",
            capabilities: {
                tools: {}
            },
            serverInfo: {
                name: config.mcp.name,
                version: config.mcp.version
            }
        }
    };
}

/**
 * Handle tools list request
 * @param {string} id - Request ID
 * @returns {Object} Tools list response
 */
function handleToolsList(id) {
    logInfo('Handling tools/list request');
    
    return {
        jsonrpc: '2.0',
        id: id,
        result: {
            tools: [
                {
                    name: 'the_leedz',
                    description: 'Interact with the Leedz CRM system. Create clients, manage bookings, generate IDs, and get statistics.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            message: {
                                type: 'string',
                                description: 'Natural language request to the Leedz CRM'
                            }
                        },
                        required: ['message']
                    }
                }
            ]
        }
    };
}

/**
 * Extract user message from tool call parameters
 * @param {Object} params - Tool call parameters
 * @returns {string|null} User message or null if not found
 */
function extractUserMessage(params) {
    return params.arguments?.request || 
           params.arguments?.message || 
           (params.messages && params.messages[params.messages.length - 1]?.content);
}

/**
 * Handle tool call request
 * @param {string} id - Request ID
 * @param {Object} params - Tool call parameters
 * @returns {Object} Tool call response
 */
async function handleToolCall(id, params) {
    try {
        const userMessage = extractUserMessage(params);

        if (!userMessage) {
            logWarn('No user message found in tool call');
            return createErrorResponse(id, -32602, 'No user message found in request');
        }

        logInfo(`Processing tool call: ${userMessage.substring(0, 100)}...`);

        // Translate natural language to action using Claude
        const action = await translateWithClaude(userMessage);

        if (!action) {
            return createSuccessResponse(id, "I couldn't understand your request. Please try being more specific about what you want to do with the Leedz.");
        }

        // Handle non-actionable requests (conversations)
        if (action.actionable === false) {
            logInfo('Returning conversational response');
            return createSuccessResponse(id, action.response);
        }

        // Execute actionable requests (database operations)
        logInfo(`Executing database operation: ${action.method} ${action.endpoint}`);
        const result = await executeHttpRequest(action);
        const formattedResponse = formatApiResponse(result, action);

        return createSuccessResponse(id, formattedResponse);

    } catch (error) {
        logError(`Tool call error: ${error.message}`);
        return createErrorResponse(id, -32603, 'Internal error');
    }
}

// ==============================================================================
// REQUEST PROCESSING
// ==============================================================================

/**
 * Handle prompts list request
 * @param {string} id - Request ID
 * @returns {Object} Empty prompts list response
 */
function handlePromptsList(id) {
    logInfo('Handling prompts/list request');
    
    return {
        jsonrpc: '2.0',
        id: id,
        result: {
            prompts: []
        }
    };
}

/**
 * Handle resources list request
 * @param {string} id - Request ID
 * @returns {Object} Empty resources list response
 */
function handleResourcesList(id) {
    logInfo('Handling resources/list request');
    
    return {
        jsonrpc: '2.0',
        id: id,
        result: {
            resources: []
        }
    };
}

/**
 * Route JSON-RPC request to appropriate handler
 * @param {Object} request - JSON-RPC request object
 * @returns {Object} Response object
 */
async function processJsonRpcRequest(request) {
    const { id, method, params } = request;
    
    switch (method) {
        case 'initialize':
            return handleInitialize(id);
            
        case 'tools/list':
            return handleToolsList(id);
            
        case 'tools/call':
            return await handleToolCall(id, params);
            
        case 'prompts/list':
            return handlePromptsList(id);
            
        case 'resources/list':
            return handleResourcesList(id);
            
        case 'notifications/initialized':
            // No response needed for notifications
            return null;
            
        default:
            logWarn(`Unknown method: ${method}`);
            return createErrorResponse(id, -32601, 'Method not found');
    }
}

/**
 * Check if input line looks like JSON-RPC
 * @param {string} line - Input line to check
 * @returns {boolean} True if line appears to be JSON-RPC
 */
function isJsonRpcLine(line) {
    const trimmed = line.trim();
    return trimmed && looksLikeJson(trimmed);
}

/**
 * Check if parsing error might be for a JSON-RPC request
 * @param {string} line - Original input line
 * @returns {boolean} True if error should generate response
 */
function shouldRespondToParseError(line) {
    return line.includes('"jsonrpc"') || line.includes('"method"');
}

/**
 * Handle incoming input line from stdin
 * @param {string} line - Input line to process
 */
async function handleInputLine(line) {
    if (!isJsonRpcLine(line)) {
        logDebug(`Ignoring non-JSON input: ${line.substring(0, 50)}...`);
        return;
    }
    
    try {
        const request = JSON.parse(line.trim());
        const response = await processJsonRpcRequest(request);
        if (response) {
            sendJsonRpcResponse(response);
        }
        
    } catch (error) {
        if (error instanceof SyntaxError) {
            logWarn(`Invalid JSON received: ${line.substring(0, 100)}...`);
            
            if (shouldRespondToParseError(line)) {
                const errorResponse = createErrorResponse('error', -32700, 'Parse error');
                sendJsonRpcResponse(errorResponse);
            }
        } else {
            logError(`Request processing error: ${error.message}`);
            const errorResponse = createErrorResponse('error', -32603, 'Internal error');
            sendJsonRpcResponse(errorResponse);
        }
    }
}

// ==============================================================================
// SERVER LIFECYCLE
// ==============================================================================

/**
 * Set up readline interface for stdin/stdout communication
 * @returns {Object} Configured readline interface
 */
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });
}

/**
 * Handle graceful shutdown
 * @param {Object} rl - Readline interface to close
 */
function handleShutdown(rl) {
    logInfo('Shutting down MCP server...');
    rl.close();
    process.exit(0);
}

/**
 * Start the MCP server
 */
function startMcpServer() {
    console.error(`[MCP] Starting MCP server...`);
    console.error(`[MCP] Configuration loaded from: ${CONFIG_PATH}`);
    console.error(`[MCP] Log file: ${LOG_FILE_PATH}`);
    console.error(`[MCP] Database API: ${config.database.apiUrl}`);
    console.error(`[MCP] Claude API: ${config.llm.baseUrl}`);
    
    logInfo('Starting MCP server...');
    logInfo(`Configuration loaded from: ${CONFIG_PATH}`);
    logInfo(`Log file: ${LOG_FILE_PATH}`);
    logInfo(`Database API: ${config.database.apiUrl}`);
    logInfo(`Claude API: ${config.llm.baseUrl}`);
    
    const rl = createReadlineInterface();
    
    // Set up event handlers
    rl.on('line', handleInputLine);
    process.on('SIGINT', () => handleShutdown(rl));
    
    console.error(`[MCP] Server ready - listening for JSON-RPC requests...`);
    logInfo('MCP server ready - listening for JSON-RPC requests...');
}

// ==============================================================================
// SERVER STARTUP
// ==============================================================================

// Start the server
startMcpServer();