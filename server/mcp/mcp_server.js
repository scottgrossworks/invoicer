/**
 * ==============================================================================
 * LEEDZ - MCP SERVER
 * ==============================================================================
 *
 * Model Context Protocol server that exposes the Leedz database to LLM
 * orchestrators (Claude Desktop, Claude Code, Codex, ...) as a set of
 * granular, self-describing tools.
 *
 * ARCHITECTURE:
 * 1. Receives JSON-RPC messages via stdin
 * 2. Advertises one tool per database operation (list_clients, get_booking, ...)
 *    with fully-declared input schemas - the CALLING LLM picks the tool and
 *    fills in the arguments itself. No internal LLM translation step.
 * 3. Each tool call maps 1:1 to an HTTP request against the local Leedz server
 * 4. Returns raw JSON responses via stdout for the orchestrator to interpret
 *
 * The Leedz server (leedz-server.exe, port 4000) remains the sole owner of the
 * database - this process never opens the SQLite file directly.
 *
 * REQUIREMENTS: Node 18+ (uses built-in fetch - no npm dependencies)
 *
 * @author Scott Gross
 * @version 3.0.0
 */

const readline = require('readline');
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

if (!config.database?.apiUrl) {
    console.error(`[MCP] FATAL: database.apiUrl missing from config`);
    process.exit(1);
}

const API_URL = config.database.apiUrl.replace(/\/$/, '');
const HTTP_TIMEOUT_MS = 15000;

// Leedz marketplace JWT - fetched lazily on first share_leed call
let leedzJWT = null;
let leedzJWTExpiry = null;

// ==============================================================================
// LOGGING UTILITIES
// ==============================================================================

function getLogFilePath() {
    const configuredPath = config.logging?.file || './mcp_server.log';
    return path.resolve(__dirname, configuredPath);
}

const LOG_FILE_PATH = getLogFilePath();

try {
    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
} catch (error) {
    // Directory may already exist
}

/**
 * Write log entry to file with timestamp
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

const logDebug = (message) => writeLogEntry('debug', message);
const logInfo = (message) => writeLogEntry('info', message);
const logWarn = (message) => writeLogEntry('warn', message);
const logError = (message) => writeLogEntry('error', message);

// ==============================================================================
// TOOL DEFINITIONS
// ==============================================================================
//
// Each tool = { description, inputSchema, route(args) }
// route() returns { method, path, query?, body? } - the HTTP request to make.
//
// Schemas are FULLY declared (every property typed, additionalProperties false
// left off deliberately for forward-compat). Never ship a bare {type:'object'}
// node - strict clients (Groq et al.) reject them.

const CLIENT_FIELDS = {
    name: { type: 'string', description: 'Client full name (person, not organization)' },
    email: { type: 'string', description: 'Client email address' },
    phone: { type: 'string', description: 'Client phone, digits only' },
    company: { type: 'string', description: 'Organization/company name' },
    clientNotes: { type: 'string', description: 'Freeform notes (role, address, etc.)' }
};

const BOOKING_FIELDS = {
    title: { type: 'string', description: 'Short event title' },
    description: { type: 'string', description: 'One-sentence event summary' },
    notes: { type: 'string', description: 'Additional booking notes' },
    location: { type: 'string', description: 'Service address/venue' },
    startDate: { type: 'string', description: 'Event date, YYYY-MM-DD' },
    endDate: { type: 'string', description: 'End date, YYYY-MM-DD (optional, 1-day events omit)' },
    startTime: { type: 'string', description: 'Start time, 12-hour format e.g. "7:00 PM"' },
    endTime: { type: 'string', description: 'End time, 12-hour format' },
    duration: { type: 'number', description: 'Duration in hours' },
    hourlyRate: { type: 'number', description: 'Hourly rate in dollars (no $ symbol)' },
    flatRate: { type: 'number', description: 'Flat rate in dollars' },
    totalAmount: { type: 'number', description: 'Total payment in dollars' },
    status: { type: 'string', description: 'Booking status' },
    source: { type: 'string', description: 'Where this booking came from' }
};

/**
 * Build a query string from the subset of args that are actually provided.
 */
function buildQuery(args, keys) {
    const params = new URLSearchParams();
    for (const key of keys) {
        if (args[key] !== undefined && args[key] !== null && args[key] !== '') {
            params.set(key, String(args[key]));
        }
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

/**
 * Pick only the given keys from args (drop undefined).
 */
function pickFields(args, keys) {
    const out = {};
    for (const key of keys) {
        if (args[key] !== undefined) out[key] = args[key];
    }
    return out;
}

const CLIENT_FILTER_KEYS = [
    'email', 'name', 'company', 'search', 'search_any',
    'name_startsWith', 'email_endsWith', 'company_not',
    'updatedAt_lt', 'updatedAt_gte', 'orderBy', 'order'
];

const BOOKING_FILTER_KEYS = [
    'clientId', 'clientName', 'clientEmail', 'status', 'startDateFrom', 'startDateTo'
];

const TOOLS = {

    // ------------------------------------------------------------- CLIENTS

    list_clients: {
        description: 'List/search clients. All filters optional and combinable. Returns full client records.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Exact email match' },
                name: { type: 'string', description: 'Partial name match (contains)' },
                company: { type: 'string', description: 'Partial company match (contains)' },
                search: { type: 'string', description: 'Keyword search across name/email/company' },
                search_any: { type: 'string', description: 'Comma-separated keywords, matches any (e.g. "French,France,Francais")' },
                name_startsWith: { type: 'string', description: 'Names starting with this prefix' },
                email_endsWith: { type: 'string', description: 'Emails ending with this suffix (e.g. ".edu")' },
                company_not: { type: 'string', description: 'Exclude clients at this company' },
                updatedAt_lt: { type: 'string', description: 'Only clients updated before this date, YYYY-MM-DD' },
                updatedAt_gte: { type: 'string', description: 'Only clients updated on/after this date, YYYY-MM-DD' },
                orderBy: { type: 'string', description: 'Sort field: name, email, company, createdAt, updatedAt' },
                order: { type: 'string', description: 'Sort direction: asc or desc' }
            },
            required: []
        },
        route: (args) => ({ method: 'GET', path: `/clients${buildQuery(args, CLIENT_FILTER_KEYS)}` })
    },

    get_client: {
        description: 'Get one client by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Client ID' }
            },
            required: ['id']
        },
        route: (args) => ({ method: 'GET', path: `/clients/${encodeURIComponent(args.id)}` })
    },

    create_client: {
        description: 'Create a new client. If a client with the same email exists, the server finds and returns it instead of duplicating.',
        inputSchema: {
            type: 'object',
            properties: { ...CLIENT_FIELDS },
            required: ['name']
        },
        route: (args) => ({ method: 'POST', path: '/clients', body: pickFields(args, Object.keys(CLIENT_FIELDS)) })
    },

    update_client: {
        description: 'Update client fields by ID. Only provided fields change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Client ID' },
                ...CLIENT_FIELDS
            },
            required: ['id']
        },
        route: (args) => ({ method: 'PUT', path: `/clients/${encodeURIComponent(args.id)}`, body: pickFields(args, Object.keys(CLIENT_FIELDS)) })
    },

    touch_client: {
        description: 'Mark a client as processed/reviewed (bumps updatedAt, changes nothing else). Identify by id, exact email, or name. Name/email lookup fails if it matches multiple clients - then use id.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Client ID (preferred when known)' },
                email: { type: 'string', description: 'Exact client email' },
                name: { type: 'string', description: 'Client name' }
            },
            required: []
        },
        route: (args) => {
            if (args.id) {
                return { method: 'PUT', path: `/clients/${encodeURIComponent(args.id)}/touch` };
            }
            return { method: 'PUT', path: '/clients/touch', body: pickFields(args, ['name', 'email']) };
        }
    },

    delete_client: {
        description: 'Permanently delete a client by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Client ID' }
            },
            required: ['id']
        },
        route: (args) => ({ method: 'DELETE', path: `/clients/${encodeURIComponent(args.id)}` })
    },

    // ------------------------------------------------------------ BOOKINGS

    list_bookings: {
        description: 'List/filter bookings. Each booking includes full client details - no separate client lookup needed. Use startDateFrom/startDateTo for date ranges (e.g. a month or quarter). For "all info about [person]" queries, filter by clientName.',
        inputSchema: {
            type: 'object',
            properties: {
                clientId: { type: 'string', description: 'Filter by client ID' },
                clientName: { type: 'string', description: 'Filter by client name (partial, case-insensitive)' },
                clientEmail: { type: 'string', description: 'Filter by client email' },
                status: { type: 'string', description: 'Filter by booking status' },
                startDateFrom: { type: 'string', description: 'Bookings on/after this date, YYYY-MM-DD' },
                startDateTo: { type: 'string', description: 'Bookings on/before this date, YYYY-MM-DD' }
            },
            required: []
        },
        route: (args) => ({ method: 'GET', path: `/bookings${buildQuery(args, BOOKING_FILTER_KEYS)}` })
    },

    get_booking: {
        description: 'Get one booking by ID (includes client details).',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Booking ID' }
            },
            required: ['id']
        },
        route: (args) => ({ method: 'GET', path: `/bookings/${encodeURIComponent(args.id)}` })
    },

    search_bookings: {
        description: 'Keyword search across booking title/description/notes/location. NOT for client names - use list_bookings with clientName for that.',
        inputSchema: {
            type: 'object',
            properties: {
                keyword: { type: 'string', description: 'Search keyword' }
            },
            required: ['keyword']
        },
        route: (args) => ({ method: 'GET', path: `/bookings/search/${encodeURIComponent(args.keyword)}` })
    },

    create_booking: {
        description: 'Create a booking. Provide EITHER clientId OR client fields (name/email/...) - the server auto-creates/finds the client. Duplicate (same client + location + date) updates the existing booking instead.',
        inputSchema: {
            type: 'object',
            properties: {
                clientId: { type: 'string', description: 'Existing client ID (omit if providing client fields)' },
                ...CLIENT_FIELDS,
                ...BOOKING_FIELDS
            },
            required: []
        },
        route: (args) => ({
            method: 'POST',
            path: '/bookings',
            body: pickFields(args, ['clientId', ...Object.keys(CLIENT_FIELDS), ...Object.keys(BOOKING_FIELDS)])
        })
    },

    update_booking: {
        description: 'Update booking fields by ID. Booking fields ONLY - to change client info, use update_client.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Booking ID' },
                ...BOOKING_FIELDS
            },
            required: ['id']
        },
        route: (args) => ({ method: 'PUT', path: `/bookings/${encodeURIComponent(args.id)}`, body: pickFields(args, Object.keys(BOOKING_FIELDS)) })
    },

    delete_booking: {
        description: 'Permanently delete a booking by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Booking ID' }
            },
            required: ['id']
        },
        route: (args) => ({ method: 'DELETE', path: `/bookings/${encodeURIComponent(args.id)}` })
    },

    // --------------------------------------------------------- STATS / META

    get_stats: {
        description: 'System-wide statistics (client and booking counts, revenue totals).',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        },
        route: () => ({ method: 'GET', path: '/stats' })
    },

    get_client_stats: {
        description: 'Aggregate client statistics. Pass id for one client, omit for all clients.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Client ID (optional)' }
            },
            required: []
        },
        route: (args) => ({
            method: 'GET',
            path: args.id ? `/clients/${encodeURIComponent(args.id)}/stats` : '/clients/stats'
        })
    },

    health: {
        description: 'Check the Leedz server is running and which database file it is using.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        },
        route: () => ({ method: 'GET', path: '/health' })
    }
};

// ==============================================================================
// HTTP EXECUTION
// ==============================================================================

/**
 * Execute an HTTP request against the Leedz server.
 * Returns { ok, status, data } - never throws on HTTP errors.
 */
async function executeHttpRequest(route) {
    const url = `${API_URL}${route.path}`;
    logInfo(`Executing ${route.method} ${route.path}`);

    try {
        const response = await fetch(url, {
            method: route.method,
            headers: { 'Content-Type': 'application/json' },
            body: route.body !== undefined ? JSON.stringify(route.body) : undefined,
            signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
        });

        let data = null;
        try { data = await response.json(); } catch (e) { data = null; }

        if (!response.ok) {
            logWarn(`HTTP ${response.status} from ${route.method} ${route.path}`);
        }
        return { ok: response.ok, status: response.status, data };

    } catch (error) {
        logError(`HTTP request failed: ${error.message}`);
        return {
            ok: false,
            status: 0,
            data: { error: `Cannot reach Leedz server at ${API_URL} - is it running? (${error.message})` }
        };
    }
}

/**
 * Format a tool result as readable text for the orchestrator.
 */
function formatToolResult(result) {
    const { data } = result;
    if (Array.isArray(data)) {
        return `Found ${data.length} items:\n${JSON.stringify(data, null, 2)}`;
    }
    return JSON.stringify(data, null, 2);
}

// ==============================================================================
// AWS / LEEDZ JWT UTILITIES (share_leed only)
// ==============================================================================

/**
 * Fetch JWT token from AWS getToken endpoint (lazy - only when share_leed runs).
 * Same flow as Startup.js:fetchJWTToken().
 */
async function fetchLeedzJWT() {
    try {
        const apiUrl = config.aws?.apiGatewayUrl;
        const email = config.aws?.email;

        if (!apiUrl || !email) {
            logWarn('AWS config missing apiGatewayUrl or email - share_leed will not work');
            return;
        }

        // Still valid with 7+ days remaining? Keep it.
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (leedzJWT && leedzJWTExpiry > (now + sevenDays)) {
            return;
        }

        const url = `${apiUrl}/getToken?email=${encodeURIComponent(email)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const { token, expires } = await response.json();

        if (!token) {
            logWarn('getToken returned no token');
            return;
        }

        leedzJWT = token;
        leedzJWTExpiry = expires * 1000;
        logInfo(`Leedz JWT obtained, expires: ${new Date(leedzJWTExpiry).toISOString()}`);

    } catch (error) {
        logError(`Failed to fetch Leedz JWT: ${error.message}`);
    }
}

// ==============================================================================
// JSON-RPC RESPONSE UTILITIES
// ==============================================================================

function createSuccessResponse(id, text) {
    return {
        jsonrpc: '2.0',
        id: id,
        result: {
            content: [{ type: 'text', text: text }]
        }
    };
}

/**
 * Tool-level failure: returned as a normal result with isError so the
 * orchestrator LLM can read the message and self-correct.
 */
function createToolErrorResponse(id, text) {
    return {
        jsonrpc: '2.0',
        id: id,
        result: {
            isError: true,
            content: [{ type: 'text', text: text }]
        }
    };
}

/**
 * Protocol-level failure (unknown method, parse error).
 */
function createErrorResponse(id, code, message) {
    return {
        jsonrpc: '2.0',
        id: id,
        error: { code: code, message: message }
    };
}

function sendJsonRpcResponse(response) {
    process.stdout.write(JSON.stringify(response) + '\n');
}

// ==============================================================================
// MCP PROTOCOL HANDLERS
// ==============================================================================

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
                name: config.mcp?.name || 'leedz-mcp',
                version: config.mcp?.version || '3.0.0'
            }
        }
    };
}

function handleToolsList(id) {
    logInfo('Handling tools/list request');

    const tools = Object.entries(TOOLS).map(([name, def]) => ({
        name: name,
        description: def.description,
        inputSchema: def.inputSchema
    }));

    // share_leed is handled separately (AWS, not the local DB)
    tools.push({
        name: 'share_leed',
        description: 'Share a leed to the Leedz marketplace DynamoDB. Calls the addLeed API on AWS API Gateway. Use this to seed leedz with precise structured data.',
        inputSchema: {
            type: 'object',
            properties: {
                tn: { type: 'string', description: 'Trade name (e.g. Caricatures, DJ, Photographer)' },
                ti: { type: 'string', description: 'Leed title (short event name)' },
                lc: { type: 'string', description: 'Location - must end with 5-digit zip code' },
                zp: { type: 'string', description: '5-digit zip code extracted from location' },
                st: { type: 'string', description: 'Start time as epoch milliseconds' },
                et: { type: 'string', description: 'End time as epoch milliseconds (optional)' },
                dt: { type: 'string', description: 'Description/details (optional)' },
                rq: { type: 'string', description: 'Requirements/special instructions (optional)' },
                cn: { type: 'string', description: 'Client name (optional)' },
                ph: { type: 'string', description: 'Client phone digits only (optional)' },
                em: { type: 'string', description: 'Client email (optional)' },
                pr: { type: 'string', description: 'Price in cents, 0 = free (optional, defaults to 0)' },
                sh: { type: 'string', description: 'Share list: #email1,email2 for private, #* for broadcast, #*,email1 for both' },
                id: { type: 'string', description: 'Pre-generated leed ID (optional, server generates if omitted)' }
            },
            required: ['tn', 'ti', 'lc', 'st', 'sh']
        }
    });

    return {
        jsonrpc: '2.0',
        id: id,
        result: { tools: tools }
    };
}

/**
 * Handle share_leed tool call
 * Direct API call to AWS addLeed. Same flow as Share.js:sendToServer().
 */
async function handleShareLeed(id, params) {
    const args = params.arguments || {};

    // Validate required fields (same as Share.js:buildAddLeedPayload)
    const errors = [];
    if (!args.tn) errors.push('Trade name (tn) is required');
    if (!args.ti) errors.push('Title (ti) is required');
    if (!args.lc) errors.push('Location (lc) is required');
    if (!args.st) errors.push('Start time (st) is required');
    if (!args.sh) errors.push('Share list (sh) is required');

    if (args.lc && !/\d{5}$/.test(args.lc.trim())) {
        errors.push('Location must end with 5-digit zip code');
    }

    if (errors.length > 0) {
        return createToolErrorResponse(id, errors.join('; '));
    }

    // Ensure we have a valid JWT (lazy fetch)
    const now = Date.now();
    if (!leedzJWT || !leedzJWTExpiry || leedzJWTExpiry < now) {
        await fetchLeedzJWT();
    }
    if (!leedzJWT) {
        return createToolErrorResponse(id, 'No valid Leedz JWT. Check aws.email and aws.apiGatewayUrl in mcp_server_config.json');
    }

    try {
        const apiUrl = config.aws.apiGatewayUrl;

        // Build query params - same keys as Share.js:buildAddLeedPayload
        const payload = {
            tn: args.tn,
            ti: args.ti,
            lc: args.lc.trim(),
            zp: args.zp || args.lc.trim().slice(-5),
            st: args.st,
            sh: args.sh,
            session: leedzJWT
        };

        if (args.et) payload.et = args.et;
        if (args.dt) payload.dt = args.dt;
        if (args.rq) payload.rq = args.rq;
        if (args.cn) payload.cn = args.cn;
        if (args.ph) payload.ph = args.ph;
        if (args.em) payload.em = args.em;
        if (args.pr) payload.pr = args.pr;
        if (args.id) payload.id = args.id;
        if (!payload.pr) payload.pr = '0';

        const queryString = new URLSearchParams(payload).toString();
        const url = `${apiUrl}/addLeed?${queryString}`;

        logInfo(`Calling addLeed: tn=${args.tn}, ti=${args.ti}, lc=${args.lc}`);

        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const result = await response.json();

        // If 401/403, JWT may be bad - clear it
        if (response.status === 401 || response.status === 403) {
            leedzJWT = null;
            leedzJWTExpiry = null;
            return createToolErrorResponse(id, 'JWT rejected by API Gateway. Token cleared - will re-fetch on next call.');
        }

        // Response format: {cd: 1, id, ti, tn, pr} or {cd: 0, er}
        if (result.cd === 0) {
            logError(`addLeed error: ${result.er}`);
            return createToolErrorResponse(id, `addLeed failed: ${result.er || 'Unknown error'}`);
        }

        if (result.cd !== 1) {
            logError(`addLeed invalid response: ${JSON.stringify(result)}`);
            return createToolErrorResponse(id, 'Invalid response from addLeed API');
        }

        logInfo(`Leed shared: id=${result.id}, tn=${result.tn}, ti=${result.ti}`);
        return createSuccessResponse(id, `✅ Leed shared successfully!\n\nID: ${result.id}\nTrade: ${result.tn}\nTitle: ${result.ti}\nPrice: ${result.pr === 0 ? 'FREE' : '$' + (result.pr / 100).toFixed(2)}`);

    } catch (error) {
        logError(`share_leed error: ${error.message}`);
        return createToolErrorResponse(id, `share_leed failed: ${error.message}`);
    }
}

/**
 * Handle tool call request - look up the tool, build the HTTP route, execute.
 */
async function handleToolCall(id, params) {
    try {
        const toolName = params?.name;

        // share_leed goes to AWS, not the local DB
        if (toolName === 'share_leed') {
            return await handleShareLeed(id, params);
        }

        const tool = TOOLS[toolName];
        if (!tool) {
            logWarn(`Unknown tool requested: ${toolName}`);
            return createErrorResponse(id, -32602, `Unknown tool: ${toolName}`);
        }

        const args = params.arguments || {};

        // Validate declared-required arguments
        const missing = (tool.inputSchema.required || []).filter(
            key => args[key] === undefined || args[key] === null || args[key] === ''
        );
        if (missing.length > 0) {
            return createToolErrorResponse(id, `Missing required argument(s): ${missing.join(', ')}`);
        }

        // touch_client needs at least one identifier even though none is
        // individually required
        if (toolName === 'touch_client' && !args.id && !args.name && !args.email) {
            return createToolErrorResponse(id, 'touch_client requires id, name, or email');
        }

        logInfo(`Tool call: ${toolName}(${JSON.stringify(args).substring(0, 200)})`);

        const route = tool.route(args);
        const result = await executeHttpRequest(route);

        if (!result.ok) {
            const detail = result.data ? JSON.stringify(result.data) : 'no response body';
            return createToolErrorResponse(id, `${toolName} failed (HTTP ${result.status}): ${detail}`);
        }

        return createSuccessResponse(id, formatToolResult(result));

    } catch (error) {
        logError(`Tool call error: ${error.message}`);
        return createErrorResponse(id, -32603, 'Internal error');
    }
}

// ==============================================================================
// REQUEST PROCESSING
// ==============================================================================

function handlePromptsList(id) {
    return {
        jsonrpc: '2.0',
        id: id,
        result: { prompts: [] }
    };
}

function handleResourcesList(id) {
    return {
        jsonrpc: '2.0',
        id: id,
        result: { resources: [] }
    };
}

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

function looksLikeJson(text) {
    const trimmed = text.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function shouldRespondToParseError(line) {
    return line.includes('"jsonrpc"') || line.includes('"method"');
}

async function handleInputLine(line) {
    if (!line.trim() || !looksLikeJson(line)) {
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
                sendJsonRpcResponse(createErrorResponse('error', -32700, 'Parse error'));
            }
        } else {
            logError(`Request processing error: ${error.message}`);
            sendJsonRpcResponse(createErrorResponse('error', -32603, 'Internal error'));
        }
    }
}

// ==============================================================================
// SERVER LIFECYCLE
// ==============================================================================

function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });
}

function handleShutdown(rl) {
    logInfo('Shutting down MCP server...');
    rl.close();
    process.exit(0);
}

function startMcpServer() {
    console.error(`[MCP] Starting MCP server...`);
    console.error(`[MCP] Configuration loaded from: ${CONFIG_PATH}`);
    console.error(`[MCP] Log file: ${LOG_FILE_PATH}`);
    console.error(`[MCP] Leedz server API: ${API_URL}`);
    console.error(`[MCP] Tools: ${Object.keys(TOOLS).length + 1} (${Object.keys(TOOLS).join(', ')}, share_leed)`);

    logInfo('Starting MCP server...');
    logInfo(`Leedz server API: ${API_URL}`);

    const rl = createReadlineInterface();

    rl.on('line', handleInputLine);
    process.on('SIGINT', () => handleShutdown(rl));

    console.error(`[MCP] Server ready - listening for JSON-RPC requests...`);
    logInfo('MCP server ready - listening for JSON-RPC requests...');
}

// ==============================================================================
// SERVER STARTUP
// ==============================================================================

startMcpServer();
