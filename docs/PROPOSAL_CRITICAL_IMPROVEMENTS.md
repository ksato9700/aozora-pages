# System Improvements: Phase 2

This document tracks completed and upcoming improvements for the Aozora Pages application.

## Completed Improvements

1.  **[DONE] Security: SSRF Mitigation in Reader** (Implemented in PR #1)
2.  **[DONE] Stability: Memory Protection** (Implemented in PR #1)
3.  **[DONE] Reliability: Algolia v5 Type Safety** (Implemented in PR #2)
4.  **[DONE] Performance: N+1 Firestore Query Optimization** (Implemented in PR #2)
5.  **[DONE] Maintainability: Resolve Cyclic Dependencies** (Implemented in PR #2)

## Upcoming Improvements (Phase 2)

### 6. Security/Cost: Search Rate Limiting & Caching
*   **Issue:** The `search` Server Action is not rate-limited and lacks caching. Malicious users or bots could programmatically call this action, and repeated identical searches incur unnecessary Algolia API costs.
*   **Proposed Fix:** 
    *   Implement a simple in-memory rate limiter for the `search` action, keyed by user IP address (accessible via `headers()`).
    *   Add a short-lived (e.g., 5-minute) in-memory cache for search results to reduce Algolia hits for popular queries.
