# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open Archiver is a secure, self-hosted platform for email archiving and eDiscovery. It supports ingestion from Google Workspace, Microsoft 365, IMAP, PST files, EML archives, and Mbox files.

## Tech Stack

- **Frontend**: SvelteKit (Svelte 5) with TailwindCSS 4
- **Backend**: Node.js with Express.js 5
- **Language**: TypeScript (strict mode) throughout
- **Database**: PostgreSQL 17 with Drizzle ORM
- **Search**: Meilisearch for full-text search
- **Job Queue**: BullMQ on Redis/Valkey
- **Package Manager**: pnpm 10.13.1 (required)
- **Node**: >=22.0.0 (required)

## Monorepo Structure

```
packages/
  backend/     - Express API server, workers, services
  frontend/    - SvelteKit web application
  types/       - Shared TypeScript types
apps/
  open-archiver/           - OSS entry point
  open-archiver-enterprise/ - Enterprise entry point
docs/          - VitePress documentation site
```

## Common Commands

```bash
# Install dependencies
pnpm install

# Development (choose one)
pnpm dev:oss           # OSS version
pnpm dev:enterprise    # Enterprise version

# Build
pnpm build:oss         # Build OSS version
pnpm build:enterprise  # Build enterprise version

# Start production
pnpm start:oss         # Start OSS with frontend and workers
pnpm start:workers     # Start workers separately

# Database
pnpm db:generate       # Generate Drizzle migrations
pnpm db:migrate        # Run migrations
pnpm db:migrate:dev    # Run migrations (dev mode)

# Code quality
pnpm lint              # Check formatting (Prettier)
pnpm format            # Fix formatting

# Documentation
pnpm docs:dev          # Dev server on port 3009
```

## Backend Architecture

The backend (`packages/backend/src/`) is organized as:

- **api/** - Express server setup, routes, controllers, middleware
- **services/** - Business logic (Ingestion, Indexing, Search, Storage, Auth, Audit, etc.)
- **workers/** - Background workers (ingestion.worker.ts, indexing.worker.ts)
- **jobs/** - Scheduled jobs (sync-scheduler)
- **database/** - Drizzle schema and migrations
- **services/ingestion-connectors/** - Email provider connectors (Gmail, O365, IMAP, PST, EML, Mbox)

## Frontend Architecture

The frontend (`packages/frontend/src/`) uses SvelteKit file-based routing:

- **routes/** - Pages (setup, dashboard, settings, auth, search)
- **lib/components/** - Reusable Svelte components
- **lib/stores/** - Svelte stores for state management
- **hooks.server.ts** - JWT authentication middleware

## Code Style

- TypeScript strict mode - avoid `any`, define types in `packages/types`
- Prettier formatting: tabs, single quotes, trailing commas, 100 char width
- Git commits: present tense, imperative mood ("Add feature" not "Added feature")

## Infrastructure Dependencies

The application requires these services (provided via docker-compose.yml):
- PostgreSQL 17
- Valkey 8 (Redis-compatible)
- Meilisearch v1.15
- Apache Tika 3.2.2 (optional, for document text extraction)
