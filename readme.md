 
# WinWheel

Full-stack game platform built with React, Express, Prisma, and MySQL.

---

## Tech Stack

### Frontend
- **React 18** — UI framework
- **TypeScript** — Type safety
- **Vite** — Build tool & dev server
- **Tailwind CSS** — Styling
- **shadcn/ui** — Component library
- **PixiJS v8** — Game rendering
- **React Router v6** — Client-side routing
- **Axios** — HTTP client
- **Sonner** — Toast notifications

### Backend
- **Node.js 18+** — Runtime
- **Express** — HTTP framework
- **TypeScript** — Type safety
- **Prisma** — ORM & migrations
- **MySQL** — Database
- **JSON Web Tokens** — Authentication

---

## Prerequisites

- Node.js 18+
- MySQL 8+
- npm / yarn / pnpm

---

## Project Structure

\`\`\`
winwheel/
├── frontend/
│   └── src/
│       ├── components/        # Reusable UI components
│       │   ├── ui/            # shadcn/ui + custom primitives
│       │   └── widgets/       # Feature-specific widgets
│       ├── contexts/          # React context providers
│       ├── hooks/             # Custom React hooks
│       ├── layouts/           # Page layout components
│       ├── lib/               # Utilities and helpers
│       ├── managers/          # Singleton managers (audio, focus)
│       ├── pages/             # Route-level page components
│       └── main.tsx           # App entry point
└── backend/
    ├── src/
    │   ├── controllers/       # Route handler functions
    │   ├── middleware/        # Auth, error handling, validation
    │   ├── routes/            # Express route definitions
    │   ├── services/          # Business logic
    │   ├── lib/               # Prisma client & utilities
    │   └── index.ts           # App entry point
    └── prisma/
        ├── schema.prisma      # Database schema
        ├── migrations/        # Auto-generated migrations
        └── seed.ts            # Database seeder
\`\`\`

---

## Getting Started

### 1. Clone the repository

\`\`\`bash
git clone https://github.com/your-username/winwheel.git
cd winwheel
\`\`\`

### 2. Setup Backend

\`\`\`bash
cd backend
npm install
\`\`\`

Copy and configure environment variables:

\`\`\`bash
cp .env.example .env
\`\`\`

\`\`\`env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/winwheel"

# Auth
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
\`\`\`

Run database migrations and seed:

\`\`\`bash
npx prisma migrate dev
npx prisma db seed
\`\`\`

Start the backend:

\`\`\`bash
npm run dev
\`\`\`

API runs at \`http://localhost:3000\`

---

### 3. Setup Frontend

\`\`\`bash
cd frontend
npm install
\`\`\`

Copy and configure environment variables:

\`\`\`bash
cp .env.example .env
\`\`\`

\`\`\`env
VITE_API_URL=http://localhost:3000/api
\`\`\`

Start the frontend:

\`\`\`bash
npm run dev
\`\`\`

App runs at \`http://localhost:5173\`

---

## Scripts

### Frontend

| Command | Description |
|---|---|
| \`npm run dev\` | Start dev server |
| \`npm run build\` | Production build |
| \`npm run preview\` | Preview production build |
| \`npm run lint\` | Run ESLint |

### Backend

| Command | Description |
|---|---|
| \`npm run dev\` | Start dev server with hot reload |
| \`npm run build\` | Compile TypeScript |
| \`npm run start\` | Run compiled production build |
| \`npm run lint\` | Run ESLint |

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | \`/api/auth/login\` | Login |
| POST | \`/api/auth/register\` | Register |
| POST | \`/api/auth/logout\` | Logout |

### Sessions
| Method | Endpoint | Description |
|---|---|---|
| GET | \`/api/sessions\` | List sessions |
| POST | \`/api/sessions\` | Create session |
| PATCH | \`/api/sessions/:id\` | Update session |
| DELETE | \`/api/sessions/:id\` | Delete session |
| PATCH | \`/api/sessions/reorder\` | Reorder sessions |

### Game
| Method | Endpoint | Description |
|---|---|---|
| GET | \`/api/spin/next\` | Get next session |
| POST | \`/api/spin\` | Record spin result |
| POST | \`/api/bets\` | Place a bet |

### Financials
| Method | Endpoint | Description |
|---|---|---|
| GET | \`/api/transactions\` | List transactions |
| GET | \`/api/settings/financial\` | Get financial settings |
| PUT | \`/api/settings/financial\` | Update financial settings |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | \`/api/dashboard\` | Get dashboard stats |

---

## Database

### Migrations

\`\`\`bash
# Create a new migration after schema changes
npx prisma migrate dev --name describe_your_change

# Apply migrations in production
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset
\`\`\`

### Prisma Studio

\`\`\`bash
npx prisma studio
\`\`\`

Opens a visual database browser at \`http://localhost:5555\`.

---

## Environment Variables

### Frontend

| Variable | Description | Required |
|---|---|---|
| \`VITE_API_URL\` | Backend API base URL | Yes |

### Backend

| Variable | Description | Required |
|---|---|---|
| \`PORT\` | Server port | No (default 3000) |
| \`NODE_ENV\` | Environment | No (default development) |
| \`DATABASE_URL\` | MySQL connection string | Yes |
| \`JWT_SECRET\` | JWT signing secret | Yes |
| \`JWT_EXPIRES_IN\` | JWT expiry duration | No (default 7d) |