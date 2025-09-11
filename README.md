LEEDZ INVOICER SYSTEM - PROJECT STATUS SUMMARY
================================================

PROJECT OVERVIEW
----------------
The Leedz Invoicer System is a platform for managing client bookings and generating invoices. It integrates a Chrome extension for data extraction and PDF generation with a robust backend API for data persistence and configuration management.

CORE ARCHITECTURE
-----------------
The system follows a three-tier architecture with clear separation of concerns:

1. DATABASE LAYER (SQLite + Prisma)
   - SQLite database for data persistence.
   - Prisma ORM for type-safe database operations.
   - Schema defines Client, Booking, and Config models.
   - Database abstraction through Leedz_DB interface for future extensibility.

2. API LAYER (Express.js + JavaScript)
   - RESTful HTTP API server running on port 3000.
   - Handles CRUD operations for clients, bookings, and configuration settings.
   - Implements statistics endpoints for business intelligence.
   - Uses OOP architecture with Client and Booking classes for business logic.
   - Configuration externalized to server_config.json.
   - Enhanced with `asyncRoute` middleware for consistent error handling and timeout management.

3. CLIENT-SIDE EXTENSION (Chrome Extension + JavaScript)
   - Chrome extension for interacting with web pages (e.g., Gmail, LinkedIn).
   - Features LLM integration for intelligent data extraction from emails.
   - Provides a user interface for manual booking entry and PDF settings management.
   - Generates customizable PDF invoices using Handlebars templates and `html2pdf.js`.

KEY COMPONENTS
--------------
1. Database Models:
   - Client: id, name, email, phone, company, notes, createdAt, updatedAt
   - Booking: id, clientId, description, location, startDate, endDate, startTime, endTime, duration, hourlyRate, flatRate, totalAmount, status, source, notes, createdAt, updatedAt
   - Config: id, companyName, companyAddress, companyPhone, companyEmail, logoUrl, bankName, bankAddress, bankPhone, bankAccount, bankRouting, bankWire, servicesPerformed, contactHandle, includeTerms, terms, footerText, createdAt, updatedAt

2. API Endpoints (Refactored and Streamlined):
   - `POST /clients` - Creates a new client.
   - `GET /clients` - Retrieves clients with optional filters.
   - `GET /clients/:id` - Retrieves a specific client by ID.
   - `DELETE /clients/:id` - Deletes a client by ID.
   - `GET /clients/stats` - Retrieves aggregate statistics for all clients.
   - `GET /clients/:id/stats` - Retrieves statistics for a specific client.
   - `POST /bookings` - Creates a new booking.
   - `GET /bookings` - Retrieves bookings with optional filters.
   - `GET /bookings/:id` - Retrieves a specific booking by ID.
   - `PUT /bookings/:id` - Updates an existing booking.
   - `DELETE /bookings/:id` - Deletes a booking by ID.
   - `POST /config` - Uploads and saves client configuration to database.
   - `GET /config` - Retrieves the latest configuration from the database.
   - `GET /stats` - Retrieves system-wide statistics.

3. Chrome Extension Features:
   - **Gmail Email Chain Parsing:** Advanced LLM-powered parsing that extracts structured booking and client data from Gmail email threads and conversations using configurable system prompts.
   - **Google Calendar Parsing:** Advanced parser that extracts booking information from Google Calendar events with intelligent time/date processing.
   - **PDF Generation:** Creates professional PDF invoices from booking data and user-defined settings using Handlebars templates.
   - **Settings Management:** Allows users to configure invoice details (company info, bank info, terms) with persistence to the database and local caching.
   - **Date/Time/Currency Formatting:** Ensures consistent and user-friendly display of dates, times, and monetary values.

ARCHITECTURAL DECISIONS
-----------------------
1. OOP Refactoring: Transformed monolithic server logic into modular classes with clear separation of concerns. Client and Booking classes encapsulate business logic and validation.

2. Database Abstraction: Implemented Leedz_DB interface with Prisma_Sqlite_DB concrete implementation, allowing future database migrations without changing application logic.

3. Configuration Management: Externalized all server configuration to `server_config.json`. Client-side `invoicer_config.json` now serves as defaults/fallbacks for PDF settings, with primary storage handled by the server API and database.

4. Robust API Endpoints: Implemented `asyncRoute` middleware for all API endpoints to centralize timeout handling, retry logic, and standardized error responses.

5. Persistent Client Settings: Client PDF settings are now stored in the database via the `/config` API endpoints, ensuring persistence across sessions and browser reloads.

TECHNICAL STACK
---------------
- Backend: Node.js, Express.js, JavaScript
- Database: SQLite with Prisma ORM
- Frontend (Extension): HTML, CSS, JavaScript, Handlebars.js, html2pdf.js
- AI Integration: LM Studio (for LLM inference on client-side), Claude Desktop MCP Server integration
- Configuration: JSON-based configuration files

CURRENT STATUS - FULLY FUNCTIONAL
---------------------------------
**SYSTEM STATUS**: All core functionality is working correctly.

**What's Working**:
- Database schema fully defined (Client, Booking, Config models)
- API server fully functional with all CRUD operations and configuration management
- PDF generation with hierarchical state structure
- State management architecture correctly implemented
- Gmail email chain parsing with LLM integration working correctly
- Google Calendar event parsing with smart date/time extraction
- **MCP Server Integration**: Claude Desktop can now interact directly with the invoicing system via Model Context Protocol

**Recent Major Additions**:

**1. Gmail Email Chain Parser**:
- LLM-powered extraction of booking and client information from Gmail email threads
- Configurable system prompts for different types of email content
- Handles complex email conversations and extracts structured data
- Integration with LM Studio for local AI processing
- Smart parsing of dates, times, and contact information from email text

**2. Google Calendar Parser Enhancement**:
- Advanced parsing of Google Calendar events
- Intelligent extraction of booking details from calendar entries
- Smart time/date processing with timezone awareness
- Automatic client information extraction from calendar attendees

**3. Claude Desktop MCP Server Integration**:
- Full MCP (Model Context Protocol) server implementation at `server/mcp/mcp_server.js`
- Natural language interface for database operations via Claude Desktop
- Supports creating clients, managing bookings, and generating statistics
- JSON-RPC protocol compliance with proper error handling
- Configuration at `server/mcp/mcp_server_config.json`
- Integrates with existing API server (localhost:3000)

**MCP Server Capabilities**:
- Create and manage clients with natural language commands
- Add and update bookings through conversational interface
- Generate system statistics and reports
- Automatic translation of natural language to API calls
- Comprehensive logging and error handling

CHALLENGES ADDRESSED
-------------------
1. Server-side Redundancy: Eliminated duplicate retry/timeout logic and standardized error handling across all API endpoints.

2. Client-side Data Persistence: Implemented database-backed storage for PDF settings, overcoming browser extension limitations for direct file saving.

3. LLM Time Interpretation: Developed smart correction logic in the Gmail parser to accurately interpret ambiguous time data from LLM responses based on duration context.

4. PDF Generation Refactoring: Transitioned from programmatic HTML generation to a Handlebars templating engine for improved maintainability and flexibility in PDF output.

5. Dynamic Module Loading: Resolved complex dynamic import issues within the Chrome extension context for Handlebars and other modules.

6. **Google Calendar Date/Time Parsing**: Implemented sophisticated parsing logic to extract booking information from calendar events with varying date/time formats and timezone handling.

7. **MCP Protocol Implementation**: Built complete JSON-RPC 2.0 compliant MCP server with proper error handling, protocol version negotiation, and Claude Desktop integration.

8. **Git Secret Management**: Resolved GitHub push protection issues by implementing proper .gitignore patterns for configuration files containing API keys.

NEXT STEPS
----------
- Further refinement of LLM prompts for improved data extraction accuracy
- User interface enhancements for a more polished experience
- Consider implementing authentication/authorization for multi-user support
- Explore additional features like recurring bookings or custom invoice templates
- Expand MCP server capabilities with more advanced natural language processing
- Add calendar integration for automatic booking synchronization

SYSTEM ARCHITECTURE HIGHLIGHTS
------------------------------
This system represents a comprehensive, modern approach to business software that combines:

1. **Multi-Modal AI Integration**: Both LM Studio for client-side processing and Claude Desktop MCP server for natural language database operations

2. **Robust Backend Services**: Express.js API with comprehensive error handling, timeout management, and database abstraction

3. **Intelligent Data Extraction**: Advanced parsing capabilities for Gmail email chains and Google Calendar events with LLM-powered content extraction and smart time/date interpretation

4. **Professional PDF Generation**: Handlebars-based templating system for customizable invoice generation

5. **Modern Development Practices**: OOP architecture, database abstraction layers, configuration management, and comprehensive logging

The integration of MCP server capabilities makes this one of the first invoicing systems that can be managed entirely through natural language conversations with Claude Desktop, while maintaining full programmatic access through traditional REST APIs.
