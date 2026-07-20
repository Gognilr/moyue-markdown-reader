# Optional local AI privacy boundary

The reader remains fully usable without AI. Optional AI is **off by default** and this repository currently contains no network sender, background indexer, automatic selection capture, or full-document upload path.

`src/features/ai-privacy/localAiBoundary.ts` is a pure request-preparation boundary for a future, explicitly initiated UI action. It accepts only a reader-selected passage. Wider before/after context is excluded unless a separate confirmation flag is present. The prepared result is marked `prepared-not-sent`; a transport must be implemented and reviewed independently before anything can leave the app.

Supported configuration shapes are deliberately narrow:

- Ollama: loopback only (`localhost`, `127.0.0.1`, or `::1`), base URL or `/api/generate`.
- Custom endpoint: HTTPS, or loopback HTTP for local development. Credentials embedded in URLs, query strings, fragments, and non-HTTP(S) protocols are rejected.
- Model names are length- and character-validated. API keys are not modeled here and therefore cannot be stored or placed in a request by this module.

The prompt asks only for optional reading-aid categories and keeps the original selection authoritative. It must not replace source text or imply that the rest of the document was inspected. Automated tests cover default-off behavior, selected-only payloads, explicit context confirmation, and URL/model validation.
