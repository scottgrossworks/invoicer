# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Server (TypeScript/Node.js)
Navigate to `server/` directory for all server commands:
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run dev` - Run server with ts-node for development
- `npm start` - Run compiled server from dist/server.js
- `npm run watch` - Watch TypeScript files and recompile on changes
- `npm run mcp` - Run MCP server from dist/mcp_server.js

### Database (Prisma)
From `server/` directory:
- `npm run db:generate` - Generate Prisma client after schema changes
- `npm run db:migrate` - Create and apply database migrations
- `npm run db:studio` - Open Prisma Studio for database management

### Chrome Extension (Client)
The client is a Chrome extension with no build process - files are served directly from the `client/` directory.

## Architecture Overview

### Three-Tier Architecture
1. **Database Layer**: SQLite with Prisma ORM, abstracted through `Leedz_DB` interface
2. **API Layer**: Express.js server with OOP architecture and comprehensive error handling
3. **Client Layer**: Chrome extension with AI-powered data extraction and PDF generation

### Core Models (Prisma Schema)
- **Client**: Customer information (id, name, email, phone, company, notes)
- **Booking**: Service appointments with billing data (clientId, dates, rates, duration, status)
- **Config**: PDF invoice settings and company information stored in database

### Server Architecture
- **Database Abstraction**: `DatabaseFactory` creates `Prisma_Sqlite_DB` instances implementing `Leedz_DB` interface
- **Business Logic**: `Client` and `Booking` classes handle validation and business rules
- **API Endpoints**: RESTful endpoints for CRUD operations on all models plus statistics
- **Error Handling**: `asyncRoute` middleware provides timeout management and standardized error responses
- **Configuration**: Externalized to `server/server_config.json`

### Chrome Extension Features
- **LLM Integration**: Extracts booking/client data from Gmail using configurable prompts
- **PDF Generation**: Creates invoices using Handlebars templates and html2pdf.js
- **Multi-platform**: Works on LinkedIn, Gmail, Twitter/X with content scripts
- **Persistent Settings**: PDF configuration stored in database via API endpoints

## Key File Locations

### Server Core Files
- `server/src/ts/server.ts` - Main Express server with all API endpoints
- `server/src/ts/leedz_db.ts` - Database interface definition
- `server/src/ts/prisma_sqlite_db.ts` - Prisma implementation
- `server/src/ts/db_factory.ts` - Database factory pattern
- `server/src/ts/Client.ts` - Client business logic class
- `server/src/ts/Booking.ts` - Booking business logic class
- `server/prisma/schema.prisma` - Database schema definition
- `server/server_config.json` - Server configuration

### Chrome Extension Files
- `client/manifest.json` - Extension manifest with permissions and content scripts
- `client/js/sidebar.js` - Main extension UI and PDF generation logic
- `client/js/parser/gmail_parser.js` - LLM-powered email parsing
- `client/js/db/DB_local_prisma_sqlite.js` - Client-side API wrapper
- `client/js/render/pdf/` - PDF generation templates and utilities

## Important Development Notes

### Database Changes
Always run `npm run db:generate` after modifying `prisma/schema.prisma` to update the Prisma client.

### Server Development
The server uses TypeScript compilation. Use `npm run dev` for development with hot reloading, or `npm run build && npm start` for production-like testing.

### Chrome Extension Development
No build process required. Changes to files in `client/` directory are immediately available after refreshing the extension in Chrome.

### API Server Configuration
Server runs on port 3000 by default. All endpoints use CORS and include comprehensive error handling with timeouts and retry logic.

### LLM Integration
The Gmail parser uses LM Studio for local AI inference. The system prompt is configurable and designed to extract structured booking and client data from email content.

### STARTUP META-PROMPT
You are an expert software engineer.  We are collaborating on a software project in the INVOICER directory.
The project is described in /INVOICER/README.md

Always read INVOICER/README.md before writing any code.
After any major changes, update INVOICER/README.md to reflect the changes.

Always review server/prisma/schema.prisma to understand the database schema.
After any major changes, update schema.prisma to reflect the changes.
Document the database schema in the INVOICER/README.md file.
Add new migrations to the INVOICER/server/prisma/migrations folder.

You will be brief in your replies.  You will not blabber and write essays.  You will answer yes/no questions with a yes or no only.  You will not use emojis or special characters.  You will not use markdown.

FACT: My favorite ice cream is mint chocolate chip.
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

# CRITICAL WORKSPACE RULES
NEVER NEVER NEVER use worktrees or sandboxes.
ALWAYS work directly in C:\Users\Scott\Desktop\WKG\INVOICER
NEVER reference C:\Users\Scott\.claude-worktrees paths.
ALL edits must be to C:\Users\Scott\Desktop\WKG\INVOICER files ONLY.