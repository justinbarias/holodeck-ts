# Quickstart: Hierarchical Document Vector Store

## Prerequisites

- Bun runtime installed
- `ANTHROPIC_API_KEY` set (for agent + optional contextual embeddings)
- For embeddings: Ollama running locally OR Azure OpenAI credentials
- For external backends: the relevant service running (Redis/Postgres/ChromaDB/OpenSearch)

## 1. In-Memory (Zero Setup)

The default backend requires no external services — ideal for development.

**agent.yaml:**
```yaml
name: research-agent
model:
  provider: anthropic
  name: claude-sonnet-4-20250514
instructions:
  inline: You are a helpful research assistant. Use the search tool to find relevant information.
embedding_provider:
  provider: ollama
  name: nomic-embed-text
tools:
  - type: hierarchical_document
    name: search_docs
    description: Search the product documentation
    source: ./docs/
    search_mode: hybrid
    top_k: 10
    contextual_embeddings: false
```

**Run:**
```bash
bun run dev -- chat --agent agent.yaml
```

## 2. With Contextual Embeddings

Enable Claude-generated context prefixes for improved retrieval:

```yaml
tools:
  - type: hierarchical_document
    name: search_docs
    description: Search the product documentation
    source: ./docs/
    contextual_embeddings: true
    context_max_tokens: 100
    context_concurrency: 10
```

**Note:** Contextual embeddings use the Anthropic API (billed separately). Cost: ~$1.02 per million document tokens with prompt caching.

## 3. Redis Backend

Requires Redis 7+ with RediSearch module. Redis 8.4+ enables native hybrid search via `FT.HYBRID` for improved performance; Redis 7+ uses application-level RRF fusion.

```yaml
tools:
  - type: hierarchical_document
    name: search_docs
    description: Search the knowledge base
    source: ./docs/
    database:
      provider: redis
      connection_string: redis://localhost:6379
```

**Start Redis with RediSearch:**
```bash
docker run -p 6379:6379 redis/redis-stack-server:latest
```

## 4. Postgres Backend

Requires Postgres 15+ with pgvector extension.

```yaml
tools:
  - type: hierarchical_document
    name: search_docs
    description: Search the knowledge base
    source: ./docs/
    database:
      provider: postgres
      connection_string: postgres://user:pass@localhost:5432/holodeck
```

**Start Postgres with pgvector:**
```bash
docker run -p 5432:5432 -e POSTGRES_PASSWORD=pass pgvector/pgvector:pg16
```

## 5. ChromaDB + OpenSearch Backend

Requires ChromaDB server + OpenSearch server.

```yaml
tools:
  - type: hierarchical_document
    name: search_docs
    description: Search the knowledge base
    source: ./docs/
    database:
      provider: chromadb
      connection_string: http://localhost:8000
    keyword_search:
      provider: opensearch
      url: http://localhost:9200
```

**Start services:**
```bash
docker run -p 8000:8000 chromadb/chroma:latest
docker run -p 9200:9200 -e "discovery.type=single-node" opensearchproject/opensearch:2.12.0
```

## 6. Hybrid Search Configuration

Fine-tune search weights:

```yaml
tools:
  - type: hierarchical_document
    name: search_docs
    description: Search the knowledge base
    source: ./docs/
    search_mode: hybrid
    semantic_weight: 0.5
    keyword_weight: 0.3
    exact_weight: 0.2    # Must sum to 1.0
    top_k: 10
    min_score: 0.3
```

## 7. Azure OpenAI Embeddings

```yaml
embedding_provider:
  provider: azure_openai
  name: text-embedding-ada-002
  endpoint: ${AZURE_OPENAI_ENDPOINT}
  api_key: ${AZURE_OPENAI_API_KEY}
  api_version: "2024-02-01"
```

## Verification

After starting the agent, test with queries:

```
You: Search for information about the refund policy
Agent: [uses search_docs tool, returns relevant chunks]
```

Check that results include `source`, `breadcrumb` (heading path), and relevance scores.
