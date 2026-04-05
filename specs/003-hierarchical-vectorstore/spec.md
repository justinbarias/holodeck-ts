# Feature Specification: Hierarchical Document Vector Store

**Feature Branch**: `003-hierarchical-vectorstore`  
**Created**: 2026-04-01  
**Status**: Draft  
**Input**: User description: "Create a custom tool 'Hierarchical Document Vector Store' supporting Redis, Postgres, and ChromaDB as vector stores with corresponding keyword search backends (BM25 for Redis/Postgres, OpenSearch for ChromaDB)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure and Ingest Documents into a Vector Store (Priority: P1)

A platform user defines a `hierarchical_document` tool in their `agent.yaml` with a chosen database backend (Redis, Postgres, or ChromaDB) and a source directory of markdown files. When the agent starts, the tool automatically discovers files, chunks them using structure-aware parsing that preserves heading hierarchy, generates embeddings (optionally with contextual retrieval), and indexes both vector embeddings and keyword data into the configured backend. The user can then query the knowledge base through their agent.

**Why this priority**: Without document ingestion and indexing, no search is possible. This is the foundational capability that all other stories depend on.

**Independent Test**: Can be tested by configuring an agent with a `hierarchical_document` tool pointing at a local directory of markdown files, starting the agent, and verifying that documents are chunked, embedded, and indexed in the configured vector store backend.

**Acceptance Scenarios**:

1. **Given** an `agent.yaml` with a `hierarchical_document` tool configured with `database.provider: postgres` and `source: ./docs/`, **When** the agent initializes, **Then** all markdown files in `./docs/` are parsed, chunked with heading hierarchy preserved, embedded, and stored in Postgres using pgvector for vectors and tsvector/GIN for full-text keyword search.
2. **Given** an `agent.yaml` with `database.provider: redis`, **When** the agent initializes, **Then** documents are indexed in Redis using RediSearch for both vector embeddings and full-text keyword entries.
3. **Given** an `agent.yaml` with `database.provider: chromadb`, **When** the agent initializes, **Then** documents are indexed in ChromaDB for vector search and OpenSearch for keyword search.
4. **Given** a source directory with no supported files, **When** the agent initializes, **Then** the tool reports a clear error indicating no documents were found.

---

### User Story 2 - Hybrid Search Across Vector and Keyword Indexes (Priority: P1)

A user's agent receives a natural language query and the hierarchical document tool performs hybrid search: semantic similarity via the vector store and keyword matching via the BM25/OpenSearch index. Results from both modalities are fused using Reciprocal Rank Fusion (RRF) with configurable weights, and the top-k results are returned to the agent with source attribution, parent heading chain, and section identifiers.

**Why this priority**: Search is the core value proposition — it's the reason users configure this tool. Without hybrid search, the tool provides no utility to agents.

**Independent Test**: Can be tested by ingesting a known set of documents, issuing queries that exercise both semantic similarity and exact keyword matching, and verifying that results are correctly fused and ranked.

**Acceptance Scenarios**:

1. **Given** documents are indexed in Postgres, **When** the agent queries "What is the refund policy?", **Then** the tool returns relevant chunks ranked by fused score, including `source_path`, `parent_chain`, and `section_id` metadata.
2. **Given** `search_mode: hybrid` with `semantic_weight: 0.5`, `keyword_weight: 0.3`, `exact_weight: 0.2`, **When** a search is executed, **Then** results are fused using RRF with the configured weights and the sum of weights equals 1.0.
3. **Given** `search_mode: semantic`, **When** a search is executed, **Then** only vector similarity search is performed (no keyword search).
4. **Given** `search_mode: keyword`, **When** a search is executed, **Then** only BM25/OpenSearch keyword search is performed (no vector search).
5. **Given** a query that exactly matches a phrase in a document, **When** hybrid search is performed, **Then** the exact-match result is boosted and clearly identified.

---

### User Story 3 - Contextual Embeddings for Improved Retrieval (Priority: P2)

A user enables `contextual_embeddings: true` in their tool configuration. During ingestion, before embedding each chunk, the system uses Claude to generate a short situational context describing the chunk's role within the overall document. This context is prepended to the chunk content before embedding, improving retrieval accuracy (per Anthropic's contextual retrieval research).

**Why this priority**: Contextual retrieval significantly improves search quality but is an enhancement over basic embedding. The system works without it (plain embeddings), making this a high-value P2.

**Independent Test**: Can be tested by ingesting the same document set with and without contextual embeddings, running identical queries, and comparing retrieval relevance scores.

**Acceptance Scenarios**:

1. **Given** `contextual_embeddings: true` and `context_max_tokens: 100`, **When** documents are ingested, **Then** each chunk has a Claude-generated context (max 100 tokens) prepended before embedding.
2. **Given** `contextual_embeddings: false` (or omitted), **When** documents are ingested, **Then** chunks are embedded directly without contextual enrichment.
3. **Given** contextual embedding generation encounters rate limits, **When** processing a batch, **Then** the system retries with exponential backoff and reduces concurrency.
4. **Given** `context_concurrency: 10`, **When** contextualizing a large batch of chunks, **Then** at most 10 concurrent contextualization requests are in-flight.

---

### User Story 4 - Structure-Aware Chunking with Hierarchy Preservation (Priority: P2)

A user has complex markdown documents with nested headings, lists, and structured content. The tool's structure-aware chunker parses these documents respecting heading levels, preserving the parent chain (ancestor headings from root to immediate parent), assigning section identifiers, and splitting at logical boundaries rather than arbitrary token counts.

**Why this priority**: Structure-aware chunking is what makes this tool "hierarchical" — it's a key differentiator. However, a simpler token-based chunker can serve as a functional fallback, making this P2.

**Independent Test**: Can be tested by feeding structured markdown documents to the chunker and verifying output chunks have correct parent chains, section IDs, and respect heading boundaries.

**Acceptance Scenarios**:

1. **Given** a markdown document with `# Heading > ## Subheading > ### Sub-subheading` structure, **When** chunked with `chunking_strategy: structure`, **Then** each chunk includes the correct `parent_chain` reflecting its heading ancestry.
2. **Given** `chunking_strategy: token` with `max_chunk_tokens: 800`, **When** a document is chunked, **Then** chunks are split at approximately 800 tokens with overlap, without regard to heading structure.
3. **Given** a chunk exceeds `max_chunk_tokens`, **When** the chunker processes it, **Then** it splits at sentence boundaries rather than mid-word or mid-sentence.
4. **Given** `chunk_overlap: 50`, **When** sequential chunks are created, **Then** approximately 50 tokens of overlap exist between consecutive chunks.

---

### User Story 5 - Multiple Backend Support with Unified Interface (Priority: P2)

A user switches between Redis, Postgres, and ChromaDB backends by changing only the `database` section of their `agent.yaml`. The tool's search interface, result format, and agent interaction remain identical regardless of backend. Each backend pairs with the appropriate keyword search engine: Redis with RediSearch (native full-text), Postgres with native full-text search (tsvector/GIN), ChromaDB with OpenSearch.

**Why this priority**: Backend flexibility is important for deployment scenarios but the tool delivers value with any single backend. Supporting all three is an incremental capability.

**Independent Test**: Can be tested by running the same ingestion and search workflow against each backend and verifying identical result structures and comparable relevance.

**Acceptance Scenarios**:

1. **Given** `database.provider: redis` with a valid `connection_string`, **When** the tool initializes, **Then** it connects to Redis and creates both the vector index and full-text search index via RediSearch.
2. **Given** `database.provider: postgres` with a valid `connection_string`, **When** the tool initializes, **Then** it connects to Postgres, creates the pgvector collection for vectors and tsvector/GIN indexes for full-text search.
3. **Given** `database.provider: chromadb` with a valid `connection_string`, **When** the tool initializes, **Then** it connects to ChromaDB for vector storage and OpenSearch for keyword search.
4. **Given** an invalid or unreachable `connection_string`, **When** the tool initializes, **Then** it reports a clear connection error with the backend name and attempted endpoint.
5. **Given** results from any backend, **When** search results are returned, **Then** the result structure (fields, types, ordering) is identical across all backends.

---

### User Story 6 - In-Memory Backend for Development and Testing (Priority: P3)

A user developing locally or running tests configures `database.provider: in-memory` (the default). The tool stores all vectors and keyword data in memory with no external dependencies, making it easy to get started and run automated tests.

**Why this priority**: In-memory is the simplest backend and the default. It's essential for developer experience but less critical than the production backends.

**Independent Test**: Can be tested by configuring the tool with no `database` section (defaults to in-memory), ingesting documents, and performing searches — all without any external services.

**Acceptance Scenarios**:

1. **Given** no `database` section in the tool config, **When** the tool initializes, **Then** it defaults to in-memory storage with in-memory BM25.
2. **Given** `database.provider: in-memory`, **When** documents are ingested and searched, **Then** all operations succeed without any external service dependencies.
3. **Given** the agent session ends, **When** a new session starts, **Then** the in-memory store is empty (no persistence across sessions).

---

### Edge Cases

- What happens when the source directory contains unsupported file types mixed with supported ones? (Unsupported files are skipped with a warning log)
- How does the system handle documents that change between agent sessions? (Incremental re-indexing based on file modification time)
- What happens when the embedding provider is unreachable during ingestion? (Fail with a clear error; do not partially index)
- How does the system handle extremely large documents that exceed context windows? (Document truncation with beginning/end split for contextual embedding; chunking handles size for indexing)
- What happens when OpenSearch is unreachable but ChromaDB is available? (Degrade gracefully: return results from the working modality with a warning flag in the response metadata indicating partial results)
- What happens when `semantic_weight + keyword_weight + exact_weight` does not equal 1.0? (Validation error at configuration load time)
- How does the system handle concurrent ingestion requests? (Serialize ingestion per tool instance; concurrent search is safe)
- What happens when the vector store collection already exists with different dimensions? (Error with a message indicating dimension mismatch; suggest re-creating the collection)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST parse markdown documents preserving heading hierarchy (levels 1-6) and produce chunks with parent chain metadata.
- **FR-002**: System MUST support two chunking strategies: `structure` (heading-aware, default) and `token` (simple token-bounded).
- **FR-003**: System MUST support configurable chunk size (`max_chunk_tokens`: 100-2000, default 800) and overlap (`chunk_overlap`: 0-200, default 50).
- **FR-004**: System MUST generate vector embeddings for document chunks using the configured embedding provider (Ollama or Azure OpenAI).
- **FR-005**: System MUST optionally generate contextual embeddings using Claude, prepending a short context (up to `context_max_tokens`) to each chunk before embedding.
- **FR-006**: System MUST support four search modes: `semantic` (vector only), `keyword` (BM25/OpenSearch only), `exact` (substring match), and `hybrid` (fused, default).
- **FR-007**: System MUST implement Reciprocal Rank Fusion (RRF) for hybrid search with configurable weights (`semantic_weight`, `keyword_weight`, `exact_weight`) that must sum to 1.0.
- **FR-007a**: In hybrid mode, if one search modality fails (e.g., keyword backend unreachable), the system MUST degrade gracefully by returning results from the working modality and including a `degraded: true` warning flag with details in the response metadata.
- **FR-008**: System MUST support Redis as a vector store backend using RediSearch for both vector similarity and full-text/BM25 keyword search (single backend handles both modalities).
- **FR-009**: System MUST support Postgres as a vector store backend using pgvector for vector similarity and native full-text search (tsvector/GIN) for keyword/BM25 search.
- **FR-010**: System MUST support ChromaDB as a vector store backend with OpenSearch as the keyword search engine, configured via a separate `keyword_search` block (e.g., `keyword_search: { provider: opensearch, url: "...", headers: {} }`).
- **FR-011**: System MUST support an in-memory vector store backend with in-memory BM25 keyword search as the default.
- **FR-012**: System MUST return search results with: chunk content, fused score, source path, parent chain, section ID, and subsection IDs.
- **FR-013**: System MUST validate all tool configuration via Zod schemas at load time, rejecting invalid configurations with descriptive errors.
- **FR-014**: System MUST expose the tool to the Claude Agent SDK as a custom tool via `tool()` + Zod, accepting a search query and returning formatted results.
- **FR-015**: System MUST support configurable `top_k` (1-100, default 10) and optional `min_score` (0.0-1.0) for result filtering.
- **FR-016**: System MUST support incremental re-indexing based on file modification time, only re-processing changed files.
- **FR-017**: System MUST support concurrent contextual embedding generation with configurable concurrency (`context_concurrency`: 1-50, default 10).
- **FR-018**: System MUST handle rate limiting during contextual embedding generation with exponential backoff and adaptive concurrency reduction.
- **FR-019**: System MUST provide structured error messages that identify the failing component (chunker, embedder, vector store, keyword store) and include actionable guidance.
- **FR-020**: System MUST support the `database` configuration schema as defined in CLAUDE.md (provider, connection_string).

### Key Entities

- **DocumentChunk**: A segment of a parsed document, with content, parent chain (ancestor headings), section ID, chunk type (`CONTENT` or `HEADER`), source path, chunk index, and optional contextualized content. No glossary/definition extraction or domain-specific classification (e.g., REQUIREMENT, REFERENCE) in this version.
- **SearchResult**: A ranked result from hybrid search, with chunk content, fused score (0.0-1.0), individual modality scores, source path, parent chain, section ID, subsection IDs, exact match flag, and optional degradation warning metadata (when a modality was unavailable).
- **VectorStoreBackend**: An abstraction over Redis, Postgres, ChromaDB, or in-memory storage that provides upsert and vector similarity search operations.
- **KeywordSearchConfig**: An optional configuration block specifying the external keyword search provider (e.g., OpenSearch) with connection URL and optional headers. Required when using ChromaDB; omitted for Redis/Postgres (which use native full-text capabilities) and in-memory (which uses built-in BM25).
- **KeywordSearchProvider**: An abstraction over RediSearch full-text, Postgres tsvector/GIN, OpenSearch, or in-memory BM25 that provides keyword indexing and search operations.
- **HybridSearchExecutor**: The orchestrator that coordinates vector search and keyword search, fuses results via RRF, and returns ranked results.
- **EmbeddingProvider**: The configured embedding service (Ollama or Azure OpenAI) that generates vector representations of text.
- **ContextGenerator**: The optional component that uses Claude to generate situational context for chunks before embedding.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can configure any supported backend (Redis, Postgres, ChromaDB, in-memory) and successfully ingest and search documents without code changes.
- **SC-002**: Hybrid search returns relevant results for natural language queries, with the top-3 results containing the correct answer for at least 80% of test queries against a reference dataset.
- **SC-003**: Contextual embeddings improve retrieval relevance by at least 20% compared to plain embeddings when measured on a reference query set (measured by mean reciprocal rank).
- **SC-004**: Document ingestion processes at least 100 markdown files (average 5KB each) within 5 minutes on a standard development machine (excluding contextual embedding generation time).
- **SC-005**: Search latency is under 2 seconds for queries against a corpus of 1,000 indexed chunks on any supported backend.
- **SC-006**: Configuration validation catches 100% of invalid configurations (wrong types, missing required fields, weight sum != 1.0) at load time, before any ingestion or search occurs.
- **SC-007**: Switching backends requires changing only the `database` section of `agent.yaml` — no other configuration or code changes needed.
- **SC-008**: The tool integrates seamlessly with the Claude Agent SDK, appearing as a callable tool in agent conversations with proper input validation and formatted output.

## Clarifications

### Session 2026-04-01

- Q: How should the OpenSearch connection be configured for the ChromaDB backend? → A: Add a separate `keyword_search` config block (e.g., `keyword_search: { provider: opensearch, url: "..." }`) rather than overloading the `database` schema.
- Q: Should Redis/Postgres use in-memory BM25 or native full-text search? → A: No in-memory BM25 for external backends. Redis uses RediSearch for full-text; Postgres uses native tsvector/GIN. In-memory BM25 is only for the `in-memory` backend.
- Q: Should hybrid search fail entirely or degrade when one modality is unavailable? → A: Degrade gracefully — return results from the working modality with a `degraded: true` warning flag in response metadata.
- Q: Should the TypeScript version support chunk type classification? → A: Simplified — CONTENT and HEADER only. No glossary extraction or domain-specific types (DEFINITION, REQUIREMENT, REFERENCE).

## Assumptions

- Embedding providers (Ollama, Azure OpenAI) are pre-configured and accessible; this tool does not manage their lifecycle or deployment.
- External services (Redis, Postgres, ChromaDB, OpenSearch) are provisioned and reachable at the configured connection strings; the tool does not manage infrastructure.
- Source documents include markdown (.md), plain text (.txt), HTML (.html/.htm), DOCX (.docx), and PDF (.pdf). PDF support depends on Bun runtime compatibility with `@opendocsg/pdf2md` (WASM/Web Workers) — if incompatible, PDF conversion will be a documented limitation with a stub that throws a descriptive error.
- The in-memory BM25 implementation (used only for `in-memory` backend) uses a simple tokenization strategy (whitespace/alphanumeric splitting); advanced NLP tokenization is not required.
- Redis uses the RediSearch module for both vector similarity and full-text keyword search natively (no in-memory BM25 fallback).
- Postgres uses pgvector for vector similarity and native full-text search (tsvector with GIN indexes) for keyword search (no in-memory BM25 fallback).
- ChromaDB's native search capabilities are used for vector operations; OpenSearch is used exclusively for keyword/BM25 search when ChromaDB is the vector backend.
- The pgvector extension is pre-installed on the target Postgres instance.
- Redis is configured with the RediSearch module for vector similarity search.
- OpenSearch is version 2.x+ and accessible via HTTP.
- The tool operates within a single agent session; cross-session state persistence is managed by the external backends (not the tool).
- Contextual embedding generation requires an active Anthropic API key and incurs additional API costs.
