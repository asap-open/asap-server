# ASAP Server

Backend API for the ASAP (Applied Strength & Advancement Platform) workout tracking system.

## Tech Stack

- **Node.js** - Runtime environment
- **Express** - Web framework
- **TypeScript** - Type safety
- **Prisma** - ORM and database toolkit
- **PostgreSQL** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing

## Project Structure

```
src/
├── controllers/         # Request handlers
│   ├── auth.controller.ts
│   ├── exercise.controller.ts
│   ├── session.controller.ts
│   └── weight.controller.ts
├── routes/             # API routes
│   ├── auth.route.ts
│   ├── exercise.route.ts
│   ├── session.route.ts
│   └── weight.route.ts
├── middleware/         # Custom middleware
│   └── auth.middleware.ts
├── utils/              # Utilities
│   ├── prisma.ts       # Prisma client instance
│   └── seed.ts         # Database seeding
└── index.ts            # Application entry point

prisma/
├── schema.prisma       # Database schema
└── migrations/         # Database migrations

data/
└── exercises.json      # Exercise library data
```

## Development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Setup

1. **Install dependencies**

```bash
npm install
```

2. **Set up environment variables**

Create a `.env` file in the server directory:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/workout_db"
JWT_SECRET="your-super-secret-jwt-key-change-this"
PORT=3000
NODE_ENV=development
```

3. **Set up database**

Run Prisma migrations:

```bash
npx prisma migrate dev
```

Generate Prisma Client:

```bash
npx prisma generate
```

4. **Seed the database** (optional)

```bash
npm run seed
```

5. **Start development server**

```bash
npm run dev
```

The API will be available at http://localhost:3000

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run seed` - Seed database with exercise data
- `npx prisma studio` - Open Prisma Studio (database GUI)
- `npx prisma migrate dev` - Create and apply migrations

## Database Schema

### Core Models

**User**

- Authentication and profile data
- Email, password (hashed), username
- Links to sessions, exercises, and weight logs

**UserProfile**

- Extended user information
- Height, weight, fitness goals
- One-to-one with User

**WorkoutSession**

- Individual workout records
- Name, date, duration, total volume
- Contains multiple exercise entries

**ExerciseEntry**

- Exercise performed in a session
- Links to GlobalExercise or custom exercise
- Contains multiple sets

**Set**

- Individual set data
- Weight, reps, RPE, rest time
- Belongs to ExerciseEntry

**GlobalExercise**

- Exercise library
- Name, category, muscle groups, equipment
- Can be used across all users

**WeightLog**

- Body weight tracking over time
- Weight in kg, date, optional notes

### Relationships

```
User
├── UserProfile (1:1)
├── WorkoutSessions (1:many)
├── ExerciseEntries (1:many - custom exercises)
├── WeightLogs (1:many)
└── Routines (1:many)

WorkoutSession
└── ExerciseEntries (1:many)
    └── Sets (1:many)

GlobalExercise
└── ExerciseEntries (1:many - references)
```

## API Routes

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Exercises

- `GET /api/exercises` - List all exercises
- `GET /api/exercises/:id` - Get exercise by ID
- `POST /api/exercises` - Create custom exercise (protected)
- `PUT /api/exercises/:id` - Update custom exercise (protected)
- `DELETE /api/exercises/:id` - Delete custom exercise (protected)

### Sessions

- `GET /api/sessions` - List user sessions (protected)
- `GET /api/sessions/:id` - Get session details (protected)
- `POST /api/sessions` - Create new session (protected)
- `PUT /api/sessions/:id` - Update session (protected)
- `DELETE /api/sessions/:id` - Delete session (protected)
- `GET /api/sessions/recent` - Get recent sessions (protected)

### Weights

- `POST /api/weights` - Log body weight (protected)
- `GET /api/weights/history` - Get weight history (protected)

### Profile

- `GET /api/profile` - Get user profile (protected)
- `PUT /api/profile` - Update profile (protected)

See [API Documentation](../docs/api/) for detailed endpoint specifications.

## Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Flow

1. User registers via `/api/auth/register`
2. User logs in via `/api/auth/login` - receives JWT token
3. Client includes token in `Authorization` header for protected routes
4. Middleware validates token and attaches user to request

### Protected Routes

All routes except `/api/auth/register` and `/api/auth/login` require authentication.

Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

### Middleware

The `authenticateToken` middleware in `middleware/auth.middleware.ts`:

- Validates JWT token
- Extracts user ID from token
- Attaches user data to request object
- Returns 401 if token is invalid or missing

## Database Migrations

### Creating a Migration

```bash
npx prisma migrate dev --name migration_name
```

This will:

1. Create a new migration SQL file
2. Apply it to the database
3. Regenerate Prisma Client

### Applying Migrations

```bash
npx prisma migrate deploy
```

Use this in production environments.

### Reset Database

```bash
npx prisma migrate reset
```

⚠️ This will delete all data!

## Seeding

The seed script (`src/utils/seed.ts`) populates the database with:

- Sample exercises from `data/exercises.json`
- Exercise categories and muscle groups
- Equipment types

Run seeding:

```bash
npm run seed
```

### Custom Seeding

Edit `src/utils/seed.ts` to add:

- Sample users
- Sample workouts
- Additional exercises

## Prisma Studio

Visual database browser for development:

```bash
npx prisma studio
```

Opens at http://localhost:5555

## Building for Production

### Docker Build

```bash
docker build -t asap-server .
docker run -p 3000:3000 asap-server
```

### Manual Build

```bash
npm run build
npm start
```

The built files will be in the `dist/` directory.

## Environment Variables

| Variable       | Description                  | Default       |
| -------------- | ---------------------------- | ------------- |
| `DATABASE_URL` | PostgreSQL connection string | Required      |
| `JWT_SECRET`   | Secret key for JWT signing   | Required      |
| `PORT`         | Server port                  | `3000`        |
| `NODE_ENV`     | Environment mode             | `development` |

## Error Handling

The API uses standard HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

Error responses follow this format:

```json
{
  "error": "Error message here"
}
```

## Validation

Request validation is handled in controllers:

- Required fields are checked
- Data types are validated
- Business logic constraints are enforced

Example validations:

- Email format and uniqueness
- Positive numbers for weight/reps
- Valid date formats
- User ownership of resources

## Performance Considerations

### Database Queries

- Use Prisma's `select` to fetch only needed fields
- Implement pagination for large result sets
- Use `include` carefully to avoid N+1 queries

### Example Optimized Query

```typescript
const sessions = await prisma.workoutSession.findMany({
  where: { userId },
  select: {
    id: true,
    name: true,
    performedAt: true,
    _count: {
      select: { exerciseEntries: true },
    },
  },
  orderBy: { performedAt: "desc" },
  take: 20, // Pagination
});
```

## Testing

### Manual API Testing

Use tools like:

- **Postman** - Import API collection
- **curl** - Command-line testing
- **Thunder Client** - VS Code extension

### Example curl Commands

**Register**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","username":"testuser"}'
```

**Login**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

**Get Exercises** (requires token)

```bash
curl http://localhost:3000/api/exercises \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Deployment

### With Docker Compose

The server is automatically deployed with the full stack:

```bash
docker-compose up -d
```

### Standalone Deployment

1. Set environment variables
2. Run migrations: `npx prisma migrate deploy`
3. Build: `npm run build`
4. Start: `npm start`

### Database Backup

Regular backups recommended:

```bash
pg_dump -U postgres workout_db > backup.sql
```

## Security Best Practices

- ✅ Passwords are hashed with bcrypt
- ✅ JWT tokens for stateless authentication
- ✅ Environment variables for secrets
- ✅ Input validation on all endpoints
- ✅ CORS configured for frontend origin
- ⚠️ Use HTTPS in production
- ⚠️ Set strong JWT_SECRET
- ⚠️ Rate limiting (consider adding)

## Contributing

See the main [repository README](../README.md) for contribution guidelines.

## License

MIT
