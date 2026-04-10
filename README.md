# Nivesh Simulator — Backend API

Node.js + Express + MongoDB backend for the Nivesh AI Investing Simulator.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT (access + refresh tokens) |
| Real-time | WebSocket (ws) |
| AI | Anthropic Claude API |
| Security | Helmet, CORS, Rate limiting, bcrypt |

## Project Structure

```
nivesh-backend/
├── server.js              # Entry point
├── config/
│   └── db.js              # MongoDB connection
├── middleware/
│   ├── auth.js            # JWT protect middleware
│   └── errorHandler.js    # Global error handler
├── models/
│   ├── User.js            # User schema
│   └── Portfolio.js       # Portfolio + simulation schema
├── routes/
│   ├── auth.js            # Register, login, logout, refresh
│   ├── portfolios.js      # CRUD + simulation save
│   ├── simulate.js        # Monte Carlo engine
│   └── ai.js              # Claude API explainer
└── utils/
    ├── websocket.js       # Real-time simulation streaming
    └── seed.js            # Database seeder
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env and fill in your values:
#   MONGODB_URI — your MongoDB connection string
#   JWT_SECRET — any long random string
#   JWT_REFRESH_SECRET — another long random string
#   ANTHROPIC_API_KEY — from console.anthropic.com
#   CLIENT_URL — your frontend URL
```

### 3. Seed the database (optional)
```bash
npm run seed
# Creates two test users:
#   arjun@test.com / test1234
#   priya@test.com / test1234
```

### 4. Run the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, get tokens |
| POST | `/api/auth/logout` | Yes | Invalidate refresh token |
| POST | `/api/auth/refresh` | No | Get new access token |
| GET | `/api/auth/me` | Yes | Get current user |
| PATCH | `/api/auth/me` | Yes | Update profile |
| PATCH | `/api/auth/change-password` | Yes | Change password |
| DELETE | `/api/auth/me` | Yes | Deactivate account |

### Portfolios
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/portfolios` | Yes | List all portfolios |
| POST | `/api/portfolios` | Yes | Create portfolio |
| GET | `/api/portfolios/:id` | Yes | Get single portfolio |
| PATCH | `/api/portfolios/:id` | Yes | Update portfolio |
| DELETE | `/api/portfolios/:id` | Yes | Delete portfolio |
| POST | `/api/portfolios/:id/simulation` | Yes | Save simulation result |
| GET | `/api/portfolios/:id/simulation-history` | Yes | Get simulation history |

### Simulation
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/simulate` | No | Run Monte Carlo simulation |
| POST | `/api/simulate/compare` | No | Compare two portfolios |
| GET | `/api/simulate/presets` | No | Get all portfolio presets |

### AI
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/ai/explain` | Yes | Explain portfolio in plain language |
| POST | `/api/ai/behavioral-tip` | Yes | Get behavioral finance insight |

### WebSocket
Connect to `ws://localhost:5000/ws?token=YOUR_JWT_TOKEN`

Send:
```json
{
  "type": "stream_simulation",
  "payload": {
    "portfolioType": "balanced",
    "amount": 10000,
    "years": 3,
    "marketMood": "neutral",
    "simCount": 1000,
    "requestId": "abc123"
  }
}
```

Receive progress events:
```json
{ "type": "simulation_start", "requestId": "abc123", "total": 1000 }
{ "type": "simulation_progress", "completed": 300, "progress": 30, "buckets": [...] }
{ "type": "simulation_complete", "result": { "gainProbability": 65, ... } }
```

## Example Request — Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Rahul","email":"rahul@example.com","password":"secret123"}'
```

## Example Request — Run Simulation

```bash
curl -X POST http://localhost:5000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"portfolioType":"growth","amount":10000,"years":3,"marketMood":"bull"}'
```
