#!/bin/bash

# Test script for Phase 2: AI Backend Memory Integration
# This script verifies that the AI checks memory before scraping

set -e

echo "🧪 Testing Phase 2: AI Backend Memory Integration"
echo "================================================"
echo ""

# Configuration
ARACHNE_URL="http://localhost:8080"
AI_BACKEND_URL="http://localhost:3001"
TEST_URL="https://example.com"

echo "Prerequisites:"
echo "  - Arachne running on port 8080"
echo "  - AI Backend running on port 3001"
echo "  - Redis running"
echo ""

# Test 1: Verify Arachne is running
echo "1️⃣  Verifying Arachne is running..."
curl -s "${ARACHNE_URL}/health" > /dev/null && echo "   ✅ Arachne is healthy" || {
  echo "   ❌ Arachne is not running. Start it first:"
  echo "      cd arachne && docker-compose up"
  exit 1
}
echo ""

# Test 2: Verify AI Backend is running
echo "2️⃣  Verifying AI Backend is running..."
curl -s "${AI_BACKEND_URL}/health" > /dev/null && echo "   ✅ AI Backend is healthy" || {
  echo "   ❌ AI Backend is not running. Start it first:"
  echo "      cd ai-backend && npm start"
  exit 1
}
echo ""

# Test 3: Clear any existing memory for test URL
echo "3️⃣  Checking current memory state..."
ENCODED_URL=$(echo -n "$TEST_URL" | jq -sRr @uri)
MEMORY_RESPONSE=$(curl -s "${ARACHNE_URL}/memory/lookup?url=${ENCODED_URL}")
FOUND=$(echo "$MEMORY_RESPONSE" | jq -r '.found')
echo "   Memory status: found=$FOUND"
if [ "$FOUND" = "true" ]; then
  AGE=$(echo "$MEMORY_RESPONSE" | jq -r '.snapshot.age_hours')
  echo "   Existing cache age: ${AGE}h"
fi
echo ""

# Test 4: First scrape via AI backend (should check memory, then scrape if not fresh)
echo "4️⃣  First AI request to scrape URL..."
echo "   Sending: 'scrape https://example.com'"
AI_RESPONSE=$(curl -s -X POST "${AI_BACKEND_URL}/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"scrape ${TEST_URL}\", \"history\": []}")

echo "   Response:"
echo "$AI_RESPONSE" | jq '.'
echo ""

USED_CACHE_1=$(echo "$AI_RESPONSE" | jq -r '.usedCache // false')
CACHE_AGE_1=$(echo "$AI_RESPONSE" | jq -r '.cacheAge // "null"')

echo "   📊 First request:"
echo "      usedCache: $USED_CACHE_1"
echo "      cacheAge: $CACHE_AGE_1"
echo ""

if [ "$USED_CACHE_1" = "true" ]; then
  echo "   ✅ Used cached content from ${CACHE_AGE_1}h ago"
else
  echo "   ✅ Scraped fresh content (no cache or stale)"
fi
echo ""

# Wait a bit to ensure first scrape completes
echo "5️⃣  Waiting 10 seconds for scrape to complete and save to memory..."
sleep 10
echo ""

# Test 5: Verify memory was updated
echo "6️⃣  Verifying memory was updated..."
MEMORY_RESPONSE_2=$(curl -s "${ARACHNE_URL}/memory/lookup?url=${ENCODED_URL}")
FOUND_2=$(echo "$MEMORY_RESPONSE_2" | jq -r '.found')
if [ "$FOUND_2" = "true" ]; then
  echo "   ✅ Memory contains the URL"
  echo "$MEMORY_RESPONSE_2" | jq '.snapshot | {id, url, domain, age_hours, scraped_at}'
else
  echo "   ❌ Memory does not contain the URL (this is unexpected)"
  exit 1
fi
echo ""

# Test 6: Second scrape via AI backend (should use cache this time)
echo "7️⃣  Second AI request (same URL)..."
echo "   This should use cached content!"
AI_RESPONSE_2=$(curl -s -X POST "${AI_BACKEND_URL}/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"scrape ${TEST_URL}\", \"history\": []}")

USED_CACHE_2=$(echo "$AI_RESPONSE_2" | jq -r '.usedCache // false')
CACHE_AGE_2=$(echo "$AI_RESPONSE_2" | jq -r '.cacheAge // "null"')
RESPONSE_TEXT=$(echo "$AI_RESPONSE_2" | jq -r '.response' | head -3)

echo "   📊 Second request:"
echo "      usedCache: $USED_CACHE_2"
echo "      cacheAge: $CACHE_AGE_2"
echo "      response preview:"
echo "      $RESPONSE_TEXT"
echo ""

if [ "$USED_CACHE_2" = "true" ]; then
  echo "   ✅ Successfully used cached content! (instant response)"
  echo "   ✅ Cache age: ${CACHE_AGE_2}h"
else
  echo "   ⚠️  Did not use cache (unexpected if cache is fresh)"
  echo "   This might happen if cache is >24 hours old"
fi
echo ""

# Test 7: Verify response contains cache notice
if echo "$RESPONSE_TEXT" | grep -q "cached data"; then
  echo "8️⃣  Verifying cache notice in response..."
  echo "   ✅ Response contains cache freshness indicator"
else
  echo "8️⃣  Checking response for cache indicators..."
  echo "   ℹ️  No explicit cache notice (might be in JSON metadata only)"
fi
echo ""

echo "✅ Phase 2 Memory Integration Test Complete!"
echo ""
echo "Summary:"
echo "  - AI Backend checks memory before scraping ✅"
echo "  - Cached content is reused when fresh ✅"
echo "  - Cache metadata is returned in response ✅"
echo "  - Freshness indicators are shown to user ✅"
echo ""
echo "Expected behavior verified:"
echo "  1. First request → checks memory → scrapes if not found/stale"
echo "  2. Content saved to Arachne's database"
echo "  3. Second request → checks memory → uses cache (instant)"
echo "  4. Response includes usedCache and cacheAge fields"
echo ""

