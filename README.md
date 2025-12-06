# Scrapee

A user-friendly web interface for the Arachne web scraping engine.

## Architecture

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind
- **Scraping Engine**: Arachne (Go-based API)
- **AI Summaries**: AI Backend service
- **Deployment**: Docker + docker-compose on self-hosted infrastructure

## Getting Started

### Quick Start (Recommended)

Run the complete stack with a single command:

```bash
# 1. Copy the environment template
cp .env.example .env

# 2. Edit .env and add your API keys
# - GEMINI_API_KEY (required for AI summaries)
nano .env

# 3. Start all services
docker-compose up --build

# 4. Access the application
# - Frontend: http://localhost:3000
# - Arachne API: http://localhost:8080
# - AI Backend: http://localhost:3001
# - Redis Commander: http://localhost:8081 (optional UI)
```

### What Gets Started

The root `docker-compose.yml` starts the complete stack:

1. **Redis** (port 6379) - Job storage and caching
2. **Redis Commander** (port 8081) - Optional Redis management UI
3. **Arachne** (port 8080) - Web scraping engine
4. **AI Backend** (port 3001) - Content summarization service
5. **Frontend** (port 3000) - User interface

### Individual Service Development

Each service can also run standalone for development:

```bash
# Run only Arachne + Redis
cd arachne && docker-compose up

# Run only AI Backend
cd ai-backend && docker-compose up

# Run only Frontend (requires Arachne and AI Backend running)
cd frontend && npm run dev
```

### Environment Configuration

All configuration is in `.env` (copy from `.env.example`):

- **GEMINI_API_KEY**: Required for AI summarization
- **ARACHNE_*** variables: Scraper behavior (timeouts, rate limits, etc.)
- **REDIS_*** variables: Redis memory and port configuration
- **Port variables**: Change default ports if needed

See `.env.example` for detailed documentation of all variables.

## Features

- Submit and manage scrape jobs
- Real-time job status monitoring
- AI-powered content summaries
- Job history and result management
