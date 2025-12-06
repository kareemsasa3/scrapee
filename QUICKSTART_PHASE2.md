# Quick Start: Phase 2 - AI Backend Memory Integration

This guide shows you how to see Phase 2 in action in 5 minutes.

## Prerequisites

- Phase 1 complete (Arachne with SQLite memory layer)
- Arachne running on port 8080
- AI Backend running on port 3001
- Valid `GEMINI_API_KEY` configured

## What Phase 2 Does

The AI backend now **checks memory before scraping**:
- If we have recent data (< 24h old) → **instant response** (50-100ms)
- If data is stale or missing → scrape fresh (5-10s)

## Step 1: Start Services

```bash
# Terminal 1: Start Arachne
cd arachne
docker-compose up

# Terminal 2: Start AI Backend
cd ai-backend
npm start
```

Verify both are running:
```bash
curl http://localhost:8080/health  # Should return {"status":"ok"}
curl http://localhost:3001/health  # Should return {"status":"ok"}
```

## Step 2: First Request (Cache Miss)

Ask the AI to scrape a URL for the first time:

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "scrape https://example.com",
    "history": []
  }' | jq
```

**Expected behavior:**
- AI checks memory → not found
- Logs: `🔍 No cached content for https://example.com, scraping fresh...`
- Scrapes the URL (takes 5-10 seconds)
- Saves to memory
- Returns response with:
  - `usedCache: false`
  - `cacheAge: null`

## Step 3: Wait for Scrape to Complete

The scrape happens asynchronously. Wait about 10 seconds for it to complete and save to memory.

```bash
# Verify it was saved to memory
curl "http://localhost:8080/memory/lookup?url=https%3A%2F%2Fexample.com" | jq
```

**Expected response:**
```json
{
  "found": true,
  "snapshot": {
    "id": "...",
    "url": "https://example.com",
    "domain": "example.com",
    "age_hours": 0.0,
    ...
  }
}
```

## Step 4: Second Request (Cache Hit) 🎯

Ask the AI to scrape the **same URL** again:

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "scrape https://example.com",
    "history": []
  }' | jq
```

**Expected behavior:**
- AI checks memory → found & fresh!
- Logs: `✅ Using cached content for https://example.com (age: 0.0h)`
- Uses cached content (instant - no scraping)
- Returns response with:
  - `usedCache: true`
  - `cacheAge: 0.0` (or small number like 0.1)
  - Response includes: `ℹ️ Using cached data from 0 hours ago (instant response)`

**Compare the response times:**
- First request: ~5-10 seconds
- Second request: ~50-100ms (50-100x faster!)

## Step 5: Automated Test

Run the comprehensive test script:

```bash
./test_phase2_memory.sh
```

This will:
1. Verify both services are running
2. Check current memory state
3. Make first AI request
4. Wait for scrape to complete
5. Verify memory was updated
6. Make second AI request (should use cache)
7. Verify cache metadata

## Understanding the Response

### Cache Miss Response
```json
{
  "response": "Job Title: ...\nCompany: ...",
  "jobId": "uuid",
  "timestamp": 1733500000000,
  "usedCache": false,
  "cacheAge": null
}
```

### Cache Hit Response
```json
{
  "response": "ℹ️ Using cached data from 2.5 hours ago (instant response)\n\nJob Title: ...",
  "jobId": null,
  "timestamp": 1733500000000,
  "usedCache": true,
  "cacheAge": 2.5
}
```

**Key differences:**
- `usedCache` is `true`
- `cacheAge` shows hours since last scrape
- Response text includes cache notice
- `jobId` is `null` (no scraping job created)

## Monitoring Cache Behavior

### Check Arachne Logs
```bash
docker-compose -f arachne/docker-compose.yml logs -f scraper | grep -i memory
```

You'll see:
```
✅ Memory database initialized at /app/data/snapshots.db
```

### Check AI Backend Logs
```bash
# In ai-backend directory
npm start
```

You'll see:
```
Checking memory for: https://example.com
✅ Using cached content for https://example.com (age: 2.5h)
```

Or:
```
Checking memory for: https://example.com
🔍 No cached content for https://example.com, scraping fresh...
```

Or:
```
Checking memory for: https://example.com
⚠️  Cached content for https://example.com is stale (age: 25.3h), scraping fresh...
```

## Testing Different Scenarios

### Scenario 1: Fresh Cache (< 24h)
```bash
# Scrape a URL
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "scrape https://example.com"}' | jq

# Wait 5 minutes, scrape again → uses cache (instant)
sleep 300
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "scrape https://example.com"}' | jq
```

**Result**: Second request is instant, `usedCache: true`

### Scenario 2: Stale Cache (> 24h)
```bash
# Check a snapshot that's old
curl "http://localhost:8080/memory/lookup?url=<some-old-url>" | jq

# If age_hours > 24, AI will re-scrape
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "scrape <some-old-url>"}' | jq
```

**Result**: Re-scrapes despite cache existing, `usedCache: false`

### Scenario 3: Multiple URLs
```bash
# Scrape 3 different URLs in sequence
for url in "https://example.com" "https://example.org" "https://example.net"; do
  echo "First scrape of $url"
  curl -X POST http://localhost:3001/chat \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"scrape $url\"}" | jq -r '.usedCache'
  sleep 10
done

# Now scrape them again → all should use cache
for url in "https://example.com" "https://example.org" "https://example.net"; do
  echo "Second scrape of $url"
  curl -X POST http://localhost:3001/chat \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"scrape $url\"}" | jq -r '.usedCache'
done
```

**Result**: First loop is slow (scraping), second loop is instant (cached)

## Performance Comparison

| Scenario | Without Phase 2 | With Phase 2 |
|----------|----------------|--------------|
| First scrape | ~5-10s | ~5-10s (same) |
| Repeated scrape (< 24h) | ~5-10s | ~50-100ms (50-100x faster!) |
| Stale scrape (> 24h) | ~5-10s | ~5-10s (re-scrapes) |

## Configuration

### Change Freshness Window

Edit `ai-backend/server.js`, line ~837:

```javascript
// Current: 24 hours
const memoryCheck = await checkMemory(target, 24);

// Change to 6 hours
const memoryCheck = await checkMemory(target, 6);

// Change to 48 hours
const memoryCheck = await checkMemory(target, 48);
```

Restart the AI backend after changes.

## Troubleshooting

### Cache Not Being Used

**Symptom**: `usedCache: false` even for repeated requests

**Check:**
1. Is memory actually being saved?
   ```bash
   curl "http://localhost:8080/memory/lookup?url=<your-url>" | jq
   ```
2. Is the cache fresh (< 24h)?
   ```bash
   # Check age_hours in response
   ```
3. Are you URL-encoding correctly?
   ```bash
   # Use jq to encode: echo -n "url" | jq -sRr @uri
   ```

### Memory Check Failing

**Symptom**: Logs show memory check errors

**Check:**
1. Is Arachne running and healthy?
   ```bash
   curl http://localhost:8080/health
   ```
2. Does `/memory/lookup` endpoint work?
   ```bash
   curl "http://localhost:8080/memory/lookup?url=https%3A%2F%2Fexample.com"
   ```
3. Check Arachne logs for errors

### Cache Notice Not Showing

**Symptom**: No "ℹ️ Using cached data" in response

**Check:**
1. Is `usedCache: true` in the JSON response?
2. The notice is prepended to the `response` field, check there
3. Some response types might not include the notice (JSON extraction)

## What's Next?

Phase 2 is complete! Next up:

### Phase 3: Time-Series & Diffs
- Support multiple snapshots per URL
- Compare snapshots across time
- Visualize content changes

### Phase 4: Full-Text Search
- SQLite FTS5 integration
- Semantic search across all cached content
- "Show me everything about React"

### Phase 5: Automation
- Scheduled jobs (cron)
- Daily digests
- Email notifications

## Learn More

- `PHASE_2_COMPLETE.md` - Implementation details and architecture
- `SETUP_PROGRESS.md` - Full changelog
- `test_phase2_memory.sh` - Automated testing
- `ai-backend/server.js` - Source code (checkMemory function, line ~252)

---

**Questions?** Check the documentation or open an issue.

