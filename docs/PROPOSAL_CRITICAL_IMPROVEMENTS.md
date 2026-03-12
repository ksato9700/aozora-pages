# Change Proposal: Critical System Improvements

This document outlines several critical security, stability, and performance issues identified in the Aozora Pages codebase and proposes specific technical solutions to address them.

## 1. Security: SSRF Mitigation in Reader
*   **Current Issue:** The `fetchTextContent` function in `web/src/lib/viewer.ts` fetches any URL provided by the database without validation. This exposes the server to Server-Side Request Forgery (SSRF) attacks if malicious or internal URLs are present in the `text_url` field.
*   **Proposed Fix:** Implement a strict hostname allowlist. Only allow requests to trusted domains such as `www.aozora.gr.jp`, `aozora.ksato9700.com`, and verified Cloudflare R2 bucket endpoints.

## 2. Stability: Memory Protection (OOM Prevention)
*   **Current Issue:** The application downloads and decodes files (ZIP and Text) directly into memory without size limits. Large files could trigger "Out of Memory" (OOM) crashes on Cloud Run instances.
*   **Proposed Fix:** 
    *   Enforce a **10MB size limit** via the `Content-Length` header before downloading.
    *   Implement a **10-second timeout** for all external fetch requests.
    *   Add size checks during ZIP extraction to prevent "Zip Bomb" attacks.

## 3. Reliability: Algolia v5 Type Safety
*   **Current Issue:** `web/src/lib/algolia/search.ts` uses `as unknown as ...` casting for search results. This is brittle and bypasses the type safety of the Algolia v5 SDK, risking runtime crashes if the response structure differs from expectations (e.g., on search errors).
*   **Proposed Fix:** Refactor search logic to use proper type guards and defensive checks for the `results` array and its constituent `hits`.

## 4. Performance: N+1 Firestore Query Optimization
*   **Current Issue:** Functions like `getWorksByPerson` and `getContributorsForBook` in `web/src/lib/firestore/contributors.ts` perform individual Firestore `get()` calls in a loop (N+1 problem). This significantly increases latency and database costs.
*   **Proposed Fix:** Utilize `db.getAll()` to fetch all required Book or Person documents in a single batch request.

## 5. Maintainability: Resolve Cyclic Dependencies
*   **Current Issue:** There is a circular import between `persons.ts` and `contributors.ts`. This can cause unpredictable behavior during module initialization in Node.js.
*   **Proposed Fix:** Move the shared fetching logic or type definitions to a neutral utility file to break the cycle.
