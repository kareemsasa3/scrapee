## **Core Architectural Principles**

### **1. Separation of Concerns (Keep What Works)**

```
Arachne (Go)          → Scraping engine + Persistence layer
├─ Handles all HTTP/Chrome work
├─ Manages SQLite snapshots DB
└─ Exposes memory API (/memory/*)

AI Backend (Node.js)  → Intelligence layer
├─ Orchestrates Arachne via function calls
├─ Handles summarization/synthesis
└─ No direct DB access (uses Arachne's API)

Scrapee Frontend     → User interface
├─ Job management
├─ Query interface ("research X for me")
└─ Timeline/diff visualization
```

**Why this matters:** Each service can be upgraded/replaced independently. Arachne could swap SQLite→Postgres without AI backend knowing. AI backend could swap Gemini→Claude without touching scraper.

---

### **2. API-First Design (No Direct DB Access)**

**The AI should NEVER touch the database directly.** It calls endpoints:

```go
// Arachne exposes:
GET  /memory/lookup?url=X           // Check if we have it
GET  /memory/search?q=X&domain=Y    // Semantic search  
GET  /memory/diff?url=X&v1=ID&v2=ID // Compare versions
GET  /memory/recent?domain=Y&days=7 // Time-based query
POST /scrape                        // Trigger new scrape
```

**Why:** 
- AI backend just needs to know "what questions to ask", not SQL
- Lets you optimize/cache/index without breaking AI
- Makes testing way easier (mock the endpoints)

---

### **3. Content-Addressable Storage (Deduplication)**

**Key insight from the docs:** Use `content_hash` to detect real changes.

```sql
-- Good schema design:
CREATE TABLE snapshots (
    id UUID PRIMARY KEY,
    url TEXT NOT NULL,
    content_hash TEXT NOT NULL,  -- SHA256 of clean_text
    scraped_at TIMESTAMP,
    
    -- Only store if hash changed:
    title TEXT,
    clean_text TEXT,
    raw_html TEXT
);

CREATE INDEX idx_url_hash ON snapshots(url, content_hash);
```

**Logic:**
- Scrape page → compute hash
- If hash matches last scrape → just update `last_checked_at`
- If hash differs → new snapshot row

**Why:** A page scraped 100 times but unchanged = 1 content entry + 100 timestamp updates. Saves massive storage.

---

### **4. Incremental Complexity (Ship in Phases)**

**Phase 1: Memory (This Weekend)**
```
✓ SQLite in Arachne
✓ One table: snapshots
✓ One endpoint: /memory/lookup
✓ AI checks before scraping
```

**Phase 2: Search (Week 2)**
```
✓ Add full-text search (SQLite FTS5)
✓ Endpoint: /memory/search?q=X
✓ AI can query "what have I read about X"
```

**Phase 3: Time-Series (Week 3)**
```
✓ Multiple snapshots per URL
✓ Endpoint: /memory/diff
✓ AI can say "X changed from Y to Z"
```

**Phase 4: Automation (Week 4)**
```
✓ Scheduled jobs (cron in Arachne)
✓ Daily HN digest, job board checks
✓ Email/webhook notifications
```

**Each phase is SHIPPABLE.** No big bang rewrites.

---

### **5. Data Model: Snapshots, Not Jobs**

**Mental model shift:**

```
OLD: "I have scrape jobs with results"
NEW: "I have a time-series corpus of web snapshots"
```

**Schema relationships:**

```sql
-- Core entity
CREATE TABLE snapshots (
    id UUID PRIMARY KEY,
    url TEXT NOT NULL,
    domain TEXT GENERATED AS (parse_domain(url)),
    content_hash TEXT NOT NULL,
    title TEXT,
    clean_text TEXT,
    raw_html TEXT,
    scraped_at TIMESTAMP DEFAULT NOW()
);

-- Optional: Track what triggered each scrape
CREATE TABLE scrape_events (
    id UUID PRIMARY KEY,
    snapshot_id UUID REFERENCES snapshots(id),
    trigger_type TEXT,  -- 'manual', 'scheduled', 'ai_query'
    user_query TEXT     -- Optional: what the user asked
);

-- Future: Tags/labels
CREATE TABLE snapshot_tags (
    snapshot_id UUID REFERENCES snapshots(id),
    tag TEXT,
    PRIMARY KEY (snapshot_id, tag)
);
```

**Why:** Jobs are ephemeral. Snapshots are permanent. You're building a library, not a task queue.

---

### **6. Vector Search (Phase 5, But Plan For It)**

**Eventually you want:**
```sql
ALTER TABLE snapshots ADD COLUMN embedding VECTOR(1536);
CREATE INDEX ON snapshots USING ivfflat (embedding vector_cosine_ops);
```

**But start without it:**
- SQLite FTS5 is good enough for keyword search initially
- Embeddings require OpenAI/Cohere API calls ($$$)
- Only add when keyword search isn't enough

**Migration path:** SQLite → Postgres with pgvector when you need it.

---

## **Smart Tech Choices**

### **SQLite vs Postgres (Start with SQLite)**

| Factor | SQLite | Postgres |
|--------|--------|----------|
| Setup | Zero config | Docker/hosting needed |
| Storage | Single file | Full DBMS |
| Search | FTS5 built-in | Better full-text, pgvector |
| Scale | Good to 100k+ rows | Unlimited |
| Cost | Free | Free (self-hosted) |

**Decision:** SQLite until you hit 100k snapshots or need vector search. Then migrate.

---

### **Headless Chrome (Already Handled)**

Arachne already uses `chromedp` - this is perfect. Keep it.

**Why:** 90% of modern sites are JS-heavy. Headless Chrome renders them properly. This is your moat vs simpler scrapers.

---

### **AI Function Calling (Gemini Native)**

Gemini already supports function calling. This is your interface:

```javascript
// In ai-backend:
const tools = [
  {
    name: "check_memory",
    description: "Check if we have a recent scrape of this URL",
    parameters: { url: "string", max_age_hours: "number" }
  },
  {
    name: "scrape_url", 
    description: "Scrape a URL with headless Chrome",
    parameters: { url: "string", wait_for: "string?" }
  },
  {
    name: "search_memory",
    description: "Search previous scrapes by keyword or topic",
    parameters: { query: "string", limit: "number" }
  }
];
```

**AI decides:** "User asked about Vercel pricing → I should `check_memory` first → if stale, `scrape_url`"

---

## **Critical Decisions to Make Now**

Before we write code, align on these:

### **1. Storage Location**
Where does the SQLite file live?
- **Option A:** `/app/data/snapshots.db` (persists across container restarts via volume mount)
- **Option B:** In Arachne's repo, mounted from host

**Recommendation:** Option A. Add to docker-compose volume.

---

### **2. Deduplication Strategy**
When do we create new snapshots vs update existing?

**Proposal:**
```
IF url never seen before → new snapshot
ELSE IF content_hash changed → new snapshot  
ELSE → update last_checked_at only (no new row)
```

**This means:** 100 scrapes of an unchanged page = 1 snapshot with `last_checked_at` updated 100 times.

**Agree?**

---

### **3. Retention Policy**
Do we keep snapshots forever or expire old ones?

**Options:**
- Keep all (Wayback Machine style)
- Keep last N per URL (e.g., 10 versions)
- TTL-based (delete after 90 days)

**Recommendation:** Keep all initially. Storage is cheap. Add retention later if needed.

---

### **4. First Killer Feature**
Which one do we build first to prove value?

**Vote:**
- **A) HackerNews Daily Digest** (scrape HN daily, one master summary)
- **B) Job Tracker** (scrape job boards, alert on new matches)
- **C) Price Monitor** (track product pages, diff on changes)

**My vote:** HackerNews digest. You're already scraping HN, it's useful daily, and proves the memory + time-series value.

**Your vote?**

---

## **Proposed Implementation Order**

### **This Weekend: Memory Foundation**
1. Add SQLite to Arachne (`database/` module)
2. Schema: one `snapshots` table
3. Modify scraper to insert/update on every scrape
4. Add endpoint: `GET /memory/lookup?url=X`
5. Wire ai-backend to check memory before scraping

**Deliverable:** "AI now reuses recent scrapes instead of re-scraping"

---

### **Week 2: Search Layer**
1. Add SQLite FTS5 virtual table
2. Endpoint: `GET /memory/search?q=X`
3. Add to AI function tools
4. Test: "Show me everything I've read about React"

**Deliverable:** "AI can query your reading history"

---

### **Week 3: Time-Series & Diffs**
1. Support multiple snapshots per URL
2. Endpoint: `GET /memory/diff?url=X&v1=ID&v2=ID`
3. Frontend visualization of changes

**Deliverable:** "Track how pages change over time"

---

### **Week 4: Automation**
1. Scheduled jobs (cron in Arachne)
2. Daily HN digest job
3. Email notification on completion

**Deliverable:** "Wake up to AI-generated news summary daily"
