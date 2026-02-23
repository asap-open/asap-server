# Contributing to ASAP Server

Thank you for your interest in contributing to the ASAP backend. This guide covers environment setup, project conventions, and the PR workflow.

## Tech Stack

- **Node.js** with TypeScript (ESM)
- **Express 5** for routing
- **Prisma 7** ORM with **PostgreSQL**
- **bcryptjs** for password hashing
- **jsonwebtoken** for auth tokens
- **tsx** / **nodemon** for development

## Prerequisites

- Node.js 20+
- Yarn
- PostgreSQL 14+ (local or Docker)

## Local Setup

```bash
# 1. Fork and clone the repo
git clone https://github.com/asap-open/asap-server.git
cd asap-server

# 2. Install dependencies
yarn install

# 3. Copy and configure environment
cp .env.example .env
```

Set the following in `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/asap?schema=public
JWT_SECRET=your-secret-here
TOKEN_EXP=7d
FRONTEND_DOMAIN=http://localhost:5173
PORT=3000
```

```bash
# 4. Run database migrations
yarn prisma migrate dev

# 5. (Optional) Seed the exercise data
yarn tsx src/utils/seed.ts

# 6. Start the dev server
yarn dev
```

The API will be available at `http://localhost:3000`.

## Available Scripts

| Command                   | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `yarn dev`                | Start server with nodemon (auto-restarts on file changes) |
| `yarn build`              | Compile TypeScript to `dist/`                             |
| `yarn start`              | Run compiled output (`dist/index.js`)                     |
| `yarn prisma migrate dev` | Create and apply a new migration                          |
| `yarn prisma studio`      | Open Prisma Studio to inspect the database                |

## Project Structure

```
src/
  index.ts          # App entry — Express setup, middleware, route mounting
  controllers/      # Request handlers (validate input, call services, respond)
  middleware/        # Auth and other middleware
  routes/           # Route definitions (map paths to controllers)
  services/         # Business logic (currently exercise seeding/lookup)
  utils/
    prisma.ts       # Prisma client singleton
    seed.ts         # Exercise seed script
prisma/
  schema.prisma     # Database schema
  migrations/       # Migration history
```

## Contribution Guidelines

### Architecture Pattern

The project follows a **routes → controllers → Prisma** pattern:

- **Routes** define paths and apply middleware
- **Controllers** handle request/response, validate inputs, and interact with Prisma directly
- Keep controllers focused — extract repeated logic into `services/` or `utils/` if needed

### Branching

```
feat/add-exercise-categories-endpoint
fix/weight-record-date-timezone
refactor/session-controller-error-handling
```

### Code Style

- Use TypeScript throughout — type all request bodies, params, and responses
- Use `async/await`; avoid raw `.then()` chains
- Wrap controller logic in `try/catch` and return appropriate HTTP status codes
- Use Prisma's generated types from `prisma/generated/` for model types
- Do not commit `.env` files

### Schema Changes

If your contribution requires a database schema change:

1. Edit `prisma/schema.prisma`
2. Run `yarn prisma migrate dev --name describe-your-change`
3. Commit both the updated schema and the generated migration files

### Commits

```
feat: add GET /exercises/by-equipment/:equipment endpoint
fix: return 404 when session not found instead of 500
chore: update prisma to v7.3
```

### Pull Requests

1. Fork the repository
2. Create a feature branch off `main`
3. Make your changes
4. Run `yarn build` to confirm no TypeScript errors
5. Test your endpoint changes manually or with your preferred HTTP client
6. Open a PR describing the change, the motivation, and any migration steps

## What We Welcome

- New API endpoints that fit the existing resource model
- Bug fixes with a clear description of the issue and reproduction steps
- Performance improvements to queries
- Security improvements
- Schema improvements with well-named migrations
- Improved error handling and validation

## Questions

Open an issue before starting a large change to align on approach. API design decisions in particular benefit from early discussion.
