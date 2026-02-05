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

## Git Commits

Follow [Conventional Commits](https://conventionalcommits.org) format:

```
<type>(<scope>): <description>

[optional body]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`

**Scopes**: `backend`, `frontend`, `types`, `docs`, `db`, `api`, `ingestion`, `search`, `auth`

**Examples**:

- `feat(ingestion): add JMAP email provider support`
- `fix(api): handle null response in search endpoint`
- `docs: update installation guide`
- `refactor(backend): extract email parsing to helper`

**Commit frequently and atomically**:

- Each commit should represent a single logical change
- Commit after completing each distinct piece of work (e.g., adding a type, implementing a function, updating tests)
- Don't bundle unrelated changes in one commit
- Aim for commits that could be reverted independently if needed

## Fork Versioning

This repository is a fork with its own version scheme:

```
<upstream-version>-fork.<patch>
Example: 0.4.1-fork.1, 0.4.1-fork.2, etc.
```

**Version is defined in**: `package.json` (root)

**When to bump the version**:

- Bump the fork patch number (e.g., `fork.1` → `fork.2`) when making changes
- After syncing with upstream, reset to new base (e.g., `0.5.0-fork.1`)

**Update version when**:

- Adding new features
- Fixing bugs
- Making any user-facing changes

The footer displays the current version and alerts when upstream has updates available.

## Syncing Fork with Upstream

To sync with the upstream repository:

```bash
# Check for new upstream changes
git fetch upstream
git log main..upstream/main --oneline  # Shows commits you're missing

# Option 1: Merge (preserves history, safer)
git merge upstream/main
git push origin main

# Option 2: Rebase (cleaner linear history)
git rebase upstream/main
git push origin main --force-with-lease
```

**Resolving conflicts**:

1. Git will pause and show conflicting files
2. Edit files to resolve conflicts
3. `git add <resolved-files>`
4. `git merge --continue` or `git rebase --continue`

**Remote configuration**:

- `origin` - Your fork (daleiii/OpenArchiver) - default push target
- `upstream` - Main repo (LogicLabs-OU/OpenArchiver) - source of updates

## Infrastructure Dependencies

The application requires these services (provided via docker-compose.yml):

- PostgreSQL 17
- Valkey 8 (Redis-compatible)
- Meilisearch v1.15
- Apache Tika 3.2.2 (optional, for document text extraction)
