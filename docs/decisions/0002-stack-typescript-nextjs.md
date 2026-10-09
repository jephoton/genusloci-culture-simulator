# 0002 — Stack: TypeScript / Next.js on Vercel; sim in a Web Worker

- **Status:** Accepted (2026-10-09)
- **Decision:** TypeScript end to end. Next.js on Vercel. The sim runs client-side in a Web Worker using typed arrays; rendering uses deck.gl + MapLibre.
- **Rationale:** compute at about 5,000 agents is cheap in JS; the real bottlenecks are Qloo and LLM latency. Go/Rust don't help with those. The pure engine stays portable to Rust/WASM if ever needed.
