# LEEDZ INVOICER

## SYSTEM OVERVIEW

The Leedz Invoicer is a three-tier invoicing and booking management system consisting of:
1. SQLite database with Prisma ORM
2. Express.js REST API server 
3. Chrome extension with LLM integration and PDF generation

## ARCHITECTURE

### Database Layer
- **Technology**: SQLite with Prisma ORM
- **Models**: Client, Booking, Config
- **Interface**: `Leedz_DB` abstraction with `Prisma_Sqlite_DB` implementation
- **Location**: `server/prisma/schema.prisma`

### API Server
- **Technology**: Node.js Express.js
- **Port**: 3000
- **Architecture**: OOP with `Client` and `Booking` business logic classes
- **Error Handling**: `asyncRoute` middleware with timeout management
- **Configuration**: `server/server_config.json`

### Chrome Extension
- **Technology**: Vanilla JavaScript, Handlebars templating
- **Content Scripts**: Gmail and Google Calendar integration
- **PDF Generation**: html2pdf.js with Handlebars templates
- **LLM Integration**: LM Studio local inference

### MCP Server Integration
- **Protocol**: JSON-RPC 2.0 Model Context Protocol
- **Implementation**: `server/mcp/mcp_server.js`
- **Configuration**: `server/mcp/mcp_server_config.json`
- **Client**: Claude Desktop integration

## DATA MODELS

### Client
```javascript
{
  id: String (UUID),
  name: String (required),
  email: String,
  phone: String,
  company: String,
  notes: String,
  createdAt: DateTime,
  updatedAt: DateTime
}
```

### Booking  
```javascript
{
  id: String (UUID),
  clientId: String (foreign key),
  description: String,
  location: String,
  startDate: DateTime,
  endDate: DateTime,
  startTime: String,
  endTime: String,
  duration: Float,
  hourlyRate: Float,
  flatRate: Float,
  totalAmount: Float,
  status: String,
  source: String,
  notes: String,
  createdAt: DateTime,
  updatedAt: DateTime
}
```

### Config
```javascript
{
  id: String (UUID),
  companyName: String,
  companyAddress: String,
  companyPhone: String,
  companyEmail: String,
  logoUrl: String,
  bankName: String,
  bankAddress: String,
  bankPhone: String,
  bankAccount: String,
  bankRouting: String,
  bankWire: String,
  servicesPerformed: String,
  contactHandle: String,
  includeTerms: Boolean,
  terms: String,
  footerText: String,
  createdAt: DateTime,
  updatedAt: DateTime
}
```

## API ENDPOINTS

### Client Operations
- `POST /clients` - Create client
- `GET /clients` - List clients with optional filters
- `GET /clients/:id` - Get specific client
- `DELETE /clients/:id` - Delete client
- `GET /clients/stats` - Aggregate client statistics
- `GET /clients/:id/stats` - Client-specific statistics

### Booking Operations
- `POST /bookings` - Create booking
- `GET /bookings` - List bookings with optional filters  
- `GET /bookings/:id` - Get specific booking
- `PUT /bookings/:id` - Update booking
- `DELETE /bookings/:id` - Delete booking

### Configuration
- `POST /config` - Save configuration to database
- `GET /config` - Retrieve latest configuration
- `GET /stats` - System-wide statistics

### Data Export Operations
- `GET /api/dump/clients` - Export all clients to JSON file in server/exports/
- `GET /api/dump/bookings` - Export all bookings to JSON file in server/exports/
- `GET /api/dump/config` - Export configuration to JSON file in server/exports/

**Dump Functionality Details:**
- Creates timestamped JSON files (e.g., `clients_1694808123456.json`)
- Files are saved to `server/exports/` directory (auto-created if missing)
- Each endpoint returns success message with file path
- Data is exported using business object `.toInterface()` methods for clean JSON structure
- All endpoints use async error handling with comprehensive logging

## CHROME EXTENSION IMPLEMENTATION

### Content Script Architecture
- **Gmail Parser**: `client/js/parser/gmail_parser.js`
- **Calendar Parser**: `client/js/parser/gcal_parser.js`
- **Main UI**: `client/js/sidebar.js`
- **Database Interface**: `client/js/db/DB_local_prisma_sqlite.js`

### Gmail Email Chain Parsing
```javascript
// LLM integration with configurable prompts
const response = await fetch('http://localhost:1234/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'model',
    messages: [{ role: 'user', content: systemPrompt + emailContent }]
  })
});
```

### Google Calendar Event Parsing
- Extracts event details from calendar DOM elements
- Parses attendee information for client data
- Handles timezone conversion and date formatting
- Maps calendar events to booking structure

### PDF Generation Pipeline
1. Handlebars template compilation
2. Data binding with booking and config data
3. HTML rendering with html2pdf.js
4. PDF output with custom styling

## MCP SERVER IMPLEMENTATION

### Protocol Compliance
- JSON-RPC 2.0 specification
- Protocol version: `2025-06-18`
- Supports `initialize`, `tools/list`, `tools/call`, `prompts/list`, `resources/list`

### Natural Language Processing
The MCP server uses Claude API as a **natural language → HTTP compiler**. The LLM is essentially a code generator - it generates executable HTTP protocol requests instead of traditional programming code. When a user says "find bookings about conference", the LLM compiles this to `GET /bookings/search/conference`, transforming natural language into executable HTTP code.

The system prompt serves as the compiler specification, documenting available endpoints (GET /clients, POST /bookings, etc.) and their parameters. Claude reads this API documentation and translates user intent into the appropriate HTTP request with correct method, endpoint, and parameters - no hardcoded mapping logic required.

**Architecture Flow:**
1. Claude Desktop calls MCP server as a plugin/tool with natural language request
2. MCP server sends request to Claude API with system prompt for compilation
3. Claude API returns HTTP request structure (method, endpoint, params)
4. **MCP server executes the HTTP request** against localhost:3000 database API
5. MCP server returns raw JSON results to Claude Desktop
6. Claude Desktop formats/analyzes results for user presentation

The MCP server acts as the **execution harness** - it orchestrates the LLM compilation step and then runs the generated HTTP code locally. Claude API never touches localhost; it only provides the HTTP structure. The MCP server bridges the remote LLM compiler with the local database server.

```javascript
// MCP server orchestrates: compile, then execute
const action = await translateWithClaude(userMessage);  // Step 2-3: LLM compiles
const result = await executeHttpRequest(action);        // Step 4: MCP executes
```

### Configuration Structure
```json
{
  "mcp": {
    "name": "leedz-invoicer-mcp",
    "version": "1.0.0", 
    "protocolVersion": "2025-06-18"
  },
  "llm": {
    "provider": "claude-opus-4-1-20250805",
    "baseUrl": "https://api.anthropic.com",
    "max_tokens": 1024
  },
  "database": {
    "apiUrl": "http://localhost:3000"
  }
}
```

## DEVELOPMENT SETUP

### Server Setup
```bash
cd server/
npm install
npm run db:generate
npm run db:migrate
npm run dev  # Development with ts-node
# OR
npm run build && npm start  # Production
```

### MCP Server
```bash
cd server/
npm run mcp  # Runs dist/mcp_server.js
```

### Chrome Extension
1. Load unpacked extension from `client/` directory
2. No build process required - direct file serving

### Claude Desktop MCP Configuration
```json
{
  "mcpServers": {
    "leedz-invoicer": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\path\\to\\server\\mcp\\mcp_server.js"]
    }
  }
}
```

### MCP Attachment Size Limitations

**CRITICAL LIMITATION**: Sending file attachments via gmail_send MCP plugin does not work due to the MCP protocol's 1MB content limit. While the Gmail API supports 25MB attachments, the MCP protocol requires the entire JSON-RPC message (including base64-encoded file content) to remain under 1MB. Base64 encoding increases file size by 33%, meaning files larger than 500-700KB will exceed the limit. In practice, even 80KB files trigger errors due to JSON overhead. The filesystem MCP plugin reads files but also fails on size constraints. It does NOT access Google Drive files as advertised. There is no workaround - attachments via MCP are not viable for anything beyond trivial file sizes.

### Claude Desktop System Prompt

Configure Claude Desktop with the following custom instructions for optimal CRM assistance:

```
ROLE: You are a conversational CRM assistant for Scott Gross, a caricature artist in Los Angeles (90034).

TOOLS AVAILABLE:
- leedz_invoicer: Database access for Clients, Bookings, and Config (business info)
- gmail_send: Send emails via Gmail with optional file attachments

RESPONSE STYLE:
- Be concise and terse - every word counts
- Answer ONLY what is asked - no summaries, notes, or reasoning
- Use tables (2-4 columns) to present data when possible
- Omit financial details (rates, amounts) unless explicitly requested
- Verify completeness: If asked for "all bookings in January", ensure ALL are included

BUSINESS CONTEXT:
- Service: Live caricature artist for events (homes, schools, festivals, trade shows)
- Brand: "That Drawing Show - with Scott Gross"
- Website: scottgross.works/drawingshow
- Instagram: @thatdrawingshow
- Territory: Southern California
- Goal: Analyze data, identify opportunities, suggest client re-engagement based on calendar/holidays/events

EMAIL SIGNATURE:
Scott Gross
scottgross.works
@scottgross.works
310-980-1421

DATE FORMATTING RULES:
- Always use YYYY-MM-DD format (ISO 8601)
- Validate: Year (2000-2099), Month (01-12), Day (01-31, valid for month)
- VALID: 2025-01-05, 2025-12-31, 2024-02-29
- INVALID: 2025-1-5, 2025-13-01, 2025-02-30
- If ambiguous/invalid, ask for clarification

GMAIL ATTACHMENTS (AUTOMATIC HANDLING):
- When user uploads file (via paperclip) and mentions sending email, AUTOMATICALLY encode and attach
- User should NEVER need to explicitly say "base64 encode" - do this transparently
- Workflow: User uploads file → User says "send this to client@example.com" → You automatically:
  1. Detect uploaded file context
  2. Base64 encode the file content
  3. Call gmail_send with attachments array populated
- Each attachment needs: filename, content (base64), contentType (MIME type)
- Example: User uploads invoice.pdf and says "email this to client" → you encode to base64 → call gmail_send with attachments: [{filename: "invoice.pdf", content: "JVBERi...", contentType: "application/pdf"}]
- Common MIME types: application/pdf, image/png, image/jpeg, application/msword, text/plain
- IMPORTANT: Make this completely transparent - user uploads, user requests email, you handle the rest
```

**Location:** Claude Desktop Settings → Custom Instructions
**Reference:** Full system prompt available in `server/mcp/STATUS.txt`

## TECHNICAL DECISIONS

### Database Abstraction
- `DatabaseFactory` pattern for multiple database implementations
- `Leedz_DB` interface ensures implementation independence
- Prisma client wrapped in abstraction layer

### Error Handling Strategy
- `asyncRoute` middleware centralizes timeout and error management
- Standardized error responses across all endpoints
- Comprehensive logging with file rotation

### Configuration Management
- Server configuration externalized to JSON files
- Client settings stored in database for persistence
- Environment-specific configuration support

### LLM Integration Architecture
- Local inference via LM Studio for privacy
- Configurable system prompts for different parsing contexts
- Fallback handling for LLM service unavailability
- **Relationship Analysis**: LLM layer analyzes booking patterns and relationships across clients without encoding complex logic in database schema. The normalized database maintains clean one-to-many Client-Booking relationships while the LLM handles pattern recognition, repeat customer identification, and contextual analysis

## DEPLOYMENT CONSIDERATIONS

### Security
- API keys managed through configuration files (excluded from git)
- No authentication implemented (single-user system)
- CORS enabled for Chrome extension integration

### Performance
- SQLite suitable for single-user scenarios
- Connection pooling handled by Prisma
- Timeout management prevents hanging requests

### Monitoring
- Comprehensive logging to files
- Error tracking through standardized middleware
- Statistics endpoints for system monitoring

## EXTENSION POINTS

### Adding New Parsers
1. Implement parser in `client/js/parser/`
2. Follow existing pattern for data extraction
3. Map extracted data to Client/Booking models

### Database Migration
1. Modify `Leedz_DB` interface
2. Update `Prisma_Sqlite_DB` implementation  
3. Create new `DatabaseFactory` implementations

### MCP Server Enhancement
1. Add new method handlers in `processJsonRpcRequest`
2. Extend system prompt for new capabilities
3. Implement corresponding API integrations

This system demonstrates practical implementation of LLM integration, protocol compliance, and modular architecture suitable for small business invoicing workflows.