# FinsNik

FinsNik is a full-stack personal finance tracker with a Go backend and a React/Vite frontend. It supports user authentication, cash and savings portfolios, investment portfolios, transaction tracking, net worth aggregation, allocation charts, and mutual fund NAV-based analytics.

## Stack

- Backend: Go, Fiber, MongoDB
- Frontend: React 19, TypeScript, Vite, Framer Motion, Recharts
- Data sources: Exchange rate API, MFAPI mutual fund NAV/scheme APIs

## Repository Layout

```text
.
├── backend/
│   ├── cmd/app/              # API entrypoint
│   ├── authorisation/        # Login, signup, password reset
│   ├── process/              # Portfolio, entries, worth, charts, NAV sync
│   ├── mongo/                # MongoDB access helpers
│   └── state/                # Shared config, cache, auth helpers, types
├── frontend/
│   ├── src/
│   │   ├── loginPage/        # Login screen
│   │   ├── signUp/           # Signup screen
│   │   ├── forgotPassword/   # Password reset screen
│   │   ├── mainPage/         # Dashboard and portfolio views
│   │   ├── PlotsPage/        # Charts and allocation views
│   │   ├── transactions/     # Combined transaction feed
│   │   ├── config/           # Frontend config and shared types
│   │   └── utils/            # Client-side cache/auth helpers
│   └── public/               # Static assets and manifest
└── README.md
```

## Features

- JWT-based authentication
- Cash and savings portfolio management
- Investment portfolio and holding management
- Buy/sell and deposit/withdraw transaction tracking
- Net worth and asset summaries
- Investment allocation, category allocation, Indian equity allocation, and cash category/currency charts
- Investment growth and cash growth history
- Background NAV sync for mutual-fund-backed investments
- In-memory caching for frequently requested aggregates

## Architecture

### Backend

The backend entrypoint is [backend/cmd/app/main.go]. It:

- configures the Fiber app
- registers all HTTP routes
- enables recovery, compression, CORS, and ETag middleware
- starts scheduled background jobs for NAV syncing and scheme cache refresh
- exposes a `/healthz` endpoint

Core backend modules:

- [backend/authorisation/login.go](/Users/nikhildslva/DevHub/FinsNik/backend/authorisation/login.go): login and token validation
- [backend/authorisation/signUp.go](/Users/nikhildslva/DevHub/FinsNik/backend/authorisation/signUp.go): signup
- [backend/authorisation/forgotPassword.go](/Users/nikhildslva/DevHub/FinsNik/backend/authorisation/forgotPassword.go): password reset
- [backend/process/networth.go](/Users/nikhildslva/DevHub/FinsNik/backend/process/networth.go): dashboard and net worth aggregation
- [backend/process/portfolios.go](/Users/nikhildslva/DevHub/FinsNik/backend/process/portfolios.go): portfolio CRUD
- [backend/process/cash.go](/Users/nikhildslva/DevHub/FinsNik/backend/process/cash.go): cash entries and cash growth
- [backend/process/investment.go](/Users/nikhildslva/DevHub/FinsNik/backend/process/investment.go): investment CRUD and transactions
- [backend/process/investmentChart.go](/Users/nikhildslva/DevHub/FinsNik/backend/process/investmentChart.go): investment growth series
- [backend/process/worth.go](/Users/nikhildslva/DevHub/FinsNik/backend/process/worth.go): chart payloads and allocation data
- [backend/process/navUpdate.go](/Users/nikhildslva/DevHub/FinsNik/backend/process/navUpdate.go): NAV sync logic
- [backend/mongo/mongo.go](/Users/nikhildslva/DevHub/FinsNik/backend/mongo/mongo.go): MongoDB operations
- [backend/state/vars.go](/Users/nikhildslva/DevHub/FinsNik/backend/state/vars.go): shared constants, auth helpers, password hashing
- [backend/state/cache.go](/Users/nikhildslva/DevHub/FinsNik/backend/state/cache.go): cache keys and invalidation

### Frontend

The frontend entrypoint is [frontend/src/main.tsx]and the app router is [frontend/src/App.tsx].

Primary routes:

- `/login`
- `/signup`
- `/forgot-password`
- `/main`
- `/portfolio/:id`
- `/investportfolio/:id`
- `/investments/:id`
- `/plots`
- `/transactions`

The frontend uses:

- `localStorage` for JWT storage and short-lived UI caches
- `Authorization: Bearer <token>` for authenticated API requests
- Vite production builds with optional gzip and brotli compression

## Environment Variables

### Backend

Create a `.env` file in the repository root with:

```env
JWT_KEY=replace-with-a-strong-secret
MONGODB_URL=mongodb+srv://<host>/?authSource=admin
MONGODB_USERNAME=<username>
MONGODB_PASSWORD=<password>
PORT=8000
```

Notes:

- `PORT` is optional; the backend defaults to `8000`.
- Do not commit real credentials or production secrets.
- Existing code expects the backend process to load these variables before startup.

### Frontend

Create `frontend/.env` if needed:

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_PREFETCH_GROWTH=true
```

`VITE_BACKEND_URL` defaults to `http://localhost:8000` if unset.

## Local Development

### 1. Start the backend

From the `backend/` directory:

```bash
go mod download
go run ./cmd/app
```

The API will start on `http://localhost:8000` unless `PORT` is set.

### 2. Start the frontend

From the `frontend/` directory:

```bash
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173`.

## Production Builds

### Frontend

```bash
cd frontend
npm run build
```

Output is written to `frontend/dist/`.

### Backend

```bash
cd backend
go build ./...
```

If your environment restricts the default Go build cache location, use:

```bash
GOCACHE=/tmp/go-build go build ./...
```

## Authentication Notes

- Login returns a JWT token.
- The frontend stores the JWT in `localStorage`.
- Authenticated requests use the `Authorization` header with the `Bearer` scheme.
- The backend still accepts legacy auth header forms for compatibility.
- Passwords are hashed with bcrypt on signup and reset.

## Background Jobs

The backend starts these jobs on boot:

- NAV sync multiple times per day
- scheme cache refresh on startup and daily
- health logging every 2 minutes

These jobs are started from [backend/cmd/app/main.go].

## Main API Areas

Auth:

- `POST /login`
- `POST /sign-up`
- `POST /forgot-password`
- `GET /token-authorisation`

Dashboard and worth:

- `GET /home`
- `GET /networth`
- `GET /networth/allocation-goal`
- `PUT /networth/allocation-goal`

Portfolios and cash:

- `POST /portfolios`
- `PUT /portfolios/:id`
- `DELETE /portfolios/:id`
- `GET /portfolios/:id`
- `GET /entries/database/:id`
- `POST /cash/entries`
- `PUT /cash/entries/:id`
- `DELETE /cash/entries/:id`
- `GET /entries/all`
- `GET /cash/growth`

Investments and charts:

- `GET /invest/portfolios/:id`
- `POST /investments`
- `GET /investments/:id`
- `PUT /investments/:id`
- `DELETE /investments/:id`
- `POST /transactions`
- `GET /transactions/:id`
- `PUT /transactions/:id`
- `DELETE /transactions/:id`
- `GET /investment/worth/:id`
- `GET /investfolio/worth/:id`
- `GET /investment/allocation`
- `GET /investment/category`
- `GET /investment/indianequity`
- `GET /cash/category-currency`
- `GET /investments/:id/growth`
- `GET /investment/growth`