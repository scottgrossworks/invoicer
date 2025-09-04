// MCP Server for Leedz Invoicing System
// Handles conversational requests from Claude Desktop and translates to HTTP API calls

import * as readline from 'readline';
import axios from 'axios';
import fs from 'fs';
import path from 'path';


// Load config at runtime instead of compile time
const configPath = path.join(__dirname, '..', 'mcp_server_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Global system prompt from config
const SYSTEM_PROMPT = config.llm.systemPrompt;

// ----------------------------
// Logging utilities
// ----------------------------
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const resolveLogPath = (): string => {
  // Ensure logs are written to the project/server root even when running from dist
  const configured = config.logging?.file || './mcp_server.log';
  return path.resolve(__dirname, '..', configured);
};

const LOG_FILE_PATH = resolveLogPath();
try {
  fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
} catch {}

const appendLog = (level: LogLevel, message: string): void => {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE_PATH, entry);
  } catch (e) {
    // Fallback: at least log to stderr if file write fails
    console.error('Failed writing to log file:', e instanceof Error ? e.message : String(e));
  }
  // Never use stdout for logs; stdout is reserved for JSON-RPC responses
  if (level === 'error' || level === 'warn') {
    // Emit only warnings and errors to stderr so LM Studio flags them appropriately
    console.error(entry.trimEnd());
  } // INFO/DEBUG are file-only to avoid cluttering client UI
};

const logInfo = (message: string): void => appendLog('info', message);
const logDebug = (message: string): void => appendLog('debug', message);
const logWarn = (message: string): void => appendLog('warn', message);
const logError = (message: string): void => appendLog('error', message);

interface MCPRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params: {
    messages: Array<{
      role: string;
      content: string;
    }>;
  };
}

interface MCPResponse {
  jsonrpc: string;
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

interface LMStudioResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

class MCPServer {
  private rl: readline.Interface;
  private dbApiUrl: string;
  private lmStudioUrl: string;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    this.dbApiUrl = config.database.apiUrl;
    this.lmStudioUrl = config.llm.url;

    this.setupEventHandlers();
  }

  /**
   * Sets up event handlers for stdin/stdout communication
   * - Listens for incoming JSON-RPC messages on stdin
   * - Handles graceful shutdown on SIGINT (Ctrl+C)
   */
  private setupEventHandlers(): void {
    this.rl.on('line', (line: string) => {
      this.handleInput(line);
    });

    process.on('SIGINT', () => {
      this.shutdown();
    });
  }

  /**
   * Handles incoming JSON-RPC messages from stdin
   * - Parses the JSON request
   * - Processes the request and generates response
   * - Sends response back to stdout
   * - Handles parsing errors gracefully
   */
  private async handleInput(line: string): Promise<void> {
    // Skip empty lines or obvious non-JSON input
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Check if it looks like JSON (starts with { or [)
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      logDebug(`Ignoring non-JSON input on stdin: ${trimmed.substring(0, 80)}...`);
      return;
    }

    try {
      const request: MCPRequest = JSON.parse(trimmed);
      const response = await this.processRequest(request);
      this.sendResponse(response);
    } catch (error) {
      if (error instanceof SyntaxError) {
        logWarn(`Invalid JSON received on stdin: ${trimmed.substring(0, 120)}...`);
        // Only send error response if it looks like it was meant to be a JSON-RPC request
        if (trimmed.includes('"jsonrpc"') || trimmed.includes('"method"')) {
          this.sendError('Invalid JSON format');
        }
      } else {
        logError(`Error processing request: ${error instanceof Error ? error.message : String(error)}`);
        this.sendError('Request processing error');
      }
    }
  }

  /**
   * Routes JSON-RPC requests to appropriate handlers
   * - 'initialize': Handles MCP protocol initialization
   * - 'tools/call': Handles conversational tool calls
   * - 'tools/list': Lists available tools (required by LM Studio)
   * - Returns error for unknown methods
   */
  private async processRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request;

    switch (method) {
      case 'tools/call':
        logInfo('Received tools/call request');
        return await this.handleToolCall(id, params);
      case 'tools/list':
        logInfo('Received tools/list request');
        return this.handleToolsList(id);
      case 'initialize':
        logInfo('Received initialize request');
        return this.handleInitialize(id);
      default:
        logWarn(`Method not found: ${method}`);
        return this.createErrorResponse(id, -32601, 'Method not found');
    }
  }

      /**
   * Handles MCP protocol initialization
   * - Returns server capabilities and version info
   * - Tells the client what this MCP server can do
   * - Required for MCP protocol handshake
   */
  private handleInitialize(id: string): MCPResponse {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id,
              result: {
          protocolVersion: config.mcp.protocolVersion,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: config.mcp.name,
            version: config.mcp.version
          }
        }
     };
    logInfo('Handled initialize');
    return response;
    }

  /**
   * Lists available tools for LM Studio
   * - Required by LM Studio to discover what tools are available
   * - Returns a single tool that handles all conversational requests
   */
  private handleToolsList(id: string): MCPResponse {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'leedz_invoicer',
            description: 'Interact with the Leedz invoicing system. Create clients, manage bookings, generate IDs, and get statistics.',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Natural language request to the invoicing system'
                }
              },
              required: ['message']
            }
          }
        ]
      }
    };
    logInfo('Handled tools/list');
    return response;
  }

  /**
   * Handles conversational tool calls from the AI client
   * - Extracts user message from the request
   * - Uses LLM to translate natural language to HTTP action or conversational response
   * - Executes HTTP actions or returns conversational responses
   * - Returns formatted response to the AI client
   */
  private async handleToolCall(id: string, params: any): Promise<MCPResponse> {
    try {
      // Extract user message from the correct location in the request
      const userMessage = params.arguments?.request || params.arguments?.message || 
                         (params.messages && params.messages[params.messages.length - 1]?.content);
      
      if (!userMessage) {
        logWarn('tools/call invoked without a user message');
        return this.createErrorResponse(id, -32602, 'No user message found in request');
      }
      logInfo(`tools/call user message: ${JSON.stringify(userMessage).substring(0, 300)}`);

      // Use LM Studio to translate conversational request
      const llmResponse = await this.translateToHttpAction(userMessage);
      
      if (!llmResponse) {
        logWarn('LLM could not translate request to actionable JSON');
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: "I couldn't understand what you want to do with the invoicing system. Please try being more specific."
            }]
          }
        };
      }

      // Check if this is actionable or conversational
      if (llmResponse.actionable === false) {
        // Non-actionable - return conversational response
        logInfo('LLM returned non-actionable response');
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: llmResponse.response
            }]
          }
        };
      }

      // Actionable - execute HTTP action
      logInfo(`Executing HTTP action: ${llmResponse.method} ${llmResponse.endpoint}`);
      const result = await this.executeHttpAction(llmResponse);
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: this.formatResponse(result, llmResponse)
          }]
        }
      };

    } catch (error) {
      logError(`Error in tool call: ${error instanceof Error ? error.message : String(error)}`);
      return this.createErrorResponse(id, -32603, 'Internal error');
    }
  }

    /**
   * Uses LLM to translate natural language to HTTP API calls
   * - Sends user message to LM Studio with system prompt
   * - System prompt defines available endpoints and expected JSON format
   * - Parses LLM response to extract HTTP method, endpoint, and data
   * - Returns null if translation fails or is unclear
   */
  private async translateToHttpAction(userMessage: string): Promise<any> {
    try {
      const response = await axios.post(this.lmStudioUrl, {
        model: config.llm.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxTokens
      }, {
        timeout: 30000 // 30 second timeout
      });

      const content: string = response.data.choices?.[0]?.message?.content ?? '';

      // Log the raw response from LM Studio
      logDebug(`LM Studio raw response: ${JSON.stringify(response.data).substring(0, 4000)}`);
      logDebug(`LM Studio content: ${content.substring(0, 2000)}`);

      // Attempt to extract JSON from the content
      const extracted = this.extractJsonString(content);
      if (!extracted) {
        logWarn('LLM response did not contain JSON');
        return null;
      }

      try {
        const parsed = JSON.parse(extracted);
        logInfo('Parsed actionable JSON from LLM response');
        return parsed;
      } catch (parseError) {
        logWarn(`Failed to parse extracted JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        return null;
      }

    } catch (error) {
      logError(`Error calling LM Studio: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Extracts the first JSON object/array substring from a text blob
   */
  private extractJsonString(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    // If already pure JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return trimmed;
    }

    // Try fenced code blocks ```json ... ```
    const fenceMatch = trimmed.match(/```json[\s\S]*?```/i) || trimmed.match(/```[\s\S]*?```/);
    if (fenceMatch) {
      const inner = fenceMatch[0].replace(/```json/i, '```').replace(/```/g, '').trim();
      if (inner.includes('{') || inner.includes('[')) return inner.substring(inner.indexOf(inner.includes('{') ? '{' : '['));
    }

    // Generic scan for first JSON-looking block
    const startIdx = Math.min(
      ...[...['{', '[']].map((ch) => {
        const idx = trimmed.indexOf(ch);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
      })
    );
    if (startIdx === Number.MAX_SAFE_INTEGER) return null;

    // Balance braces to find end
    const openChar = trimmed[startIdx];
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0;
    for (let i = startIdx; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (c === openChar) depth++;
      if (c === closeChar) depth--;
      if (depth === 0) {
        return trimmed.substring(startIdx, i + 1);
      }
    }
    return null;
  }

  /**
   * Executes HTTP requests against the database server
   * - Constructs full URL from base API URL and endpoint
   * - Sends HTTP request with appropriate method and data
   * - Handles GET requests (no body) vs POST/PUT requests (with body)
   * - Returns response data or throws descriptive error
   */
  private async executeHttpAction(action: any): Promise<any> {
    const { method, endpoint, data } = action;
    const url = `${this.dbApiUrl}${endpoint}`;

    try {
      const response = await axios({
        method: method.toLowerCase(),
        url,
        data: method === 'GET' ? undefined : data,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.data.error || 'Request failed'}`);
      }
      throw new Error('Network error');
    }
  }

  /**
   * Formats HTTP response data for display to the AI client
   * - Adds emojis and descriptive text based on HTTP method
   * - Special formatting for stats endpoints (📊)
   * - Different formatting for lists vs single items
   * - Includes success messages for POST/PUT/DELETE operations
   */
  private formatResponse(result: any, action: any): string {
    const { method, endpoint, description } = action;

    switch (method) {
      case 'GET':
        if (endpoint.includes('/stats')) {
          return `📊 ${description}\n\n${JSON.stringify(result, null, 2)}`;
        } else if (Array.isArray(result)) {
          return `📋 ${description}\n\nFound ${result.length} items:\n${JSON.stringify(result, null, 2)}`;
        } else {
          return `📄 ${description}\n\n${JSON.stringify(result, null, 2)}`;
        }
      
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
   * Sends JSON-RPC response to stdout for the AI client
   * - Serializes response object to JSON string
   * - Writes to stdout (which goes to the AI client)
   */
  private sendResponse(response: MCPResponse): void {
    // Only JSON-RPC responses are written to stdout
    console.log(JSON.stringify(response));
  }

  /**
   * Sends error response to the AI client
   * - Creates JSON-RPC error response with standard error code
   * - Used for general errors (parsing failures, etc.)
   */
  private sendError(message: string): void {
    const errorResponse: MCPResponse = {
      jsonrpc: '2.0',
      id: 'error',
      error: {
        code: -32603,
        message
      }
    };
    this.sendResponse(errorResponse);
  }

  /**
   * Creates JSON-RPC error response with specific error code
   * - Used for method-specific errors (method not found, etc.)
   * - Preserves the original request ID for proper error handling
   */
  private createErrorResponse(id: string, code: number, message: string): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message }
    };
  }

  /**
   * Handles graceful shutdown of the MCP server
   * - Closes readline interface
   * - Exits process cleanly
   * - Called on SIGINT (Ctrl+C)
   */
  private shutdown(): void {
    logInfo('Shutting down MCP server...');
    this.rl.close();
    process.exit(0);
  }

  /**
   * Starts the MCP server
   * - Logs startup message to stderr (doesn't interfere with stdout communication)
   * - Server is now ready to receive JSON-RPC messages on stdin
   */
  public start(): void {
    logInfo(`MCP Server started. Listening for requests...`);
    logInfo(`Log file: ${LOG_FILE_PATH}`);
  }
}

// Start the MCP server
const mcpServer = new MCPServer();
mcpServer.start();
