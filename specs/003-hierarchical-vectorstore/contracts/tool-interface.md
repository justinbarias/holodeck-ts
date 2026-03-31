# Contract: Hierarchical Document Vector Store — Tool Interface

**Feature Branch**: `003-hierarchical-vectorstore`
**Date**: 2026-04-01

## Overview

The hierarchical document vector store is exposed to agents as a custom tool via the Claude Agent SDK's `tool()` function, registered through `createSdkMcpServer()`. This contract defines the tool's input schema, output format, and error behavior.

## Tool Registration

Each `hierarchical_document` tool in `agent.yaml` becomes a separate tool in the MCP server:

```
Server name: "holodeck_vectorstore"
Tool name: "{tool.name}" (from YAML config)
Allowed tools pattern: "mcp__holodeck_vectorstore__{tool.name}"
```

## Input Schema (Zod Raw Shape)

```typescript
{
  query: z.string().min(1)
    .describe("Natural language search query"),
  top_k: z.number().int().min(1).max(100).optional()
    .describe("Number of results to return (default: from config)"),
  search_mode: z.enum(["semantic", "keyword", "exact", "hybrid"]).optional()
    .describe("Search strategy override (default: from config)"),
  min_score: z.number().min(0).max(1).optional()
    .describe("Minimum relevance score threshold (default: from config)"),
}
```

**Note:** This is a raw Zod shape, NOT `z.object()`. The SDK wraps it internally.

## Output Format

### Success Response

```json
{
  "query": "What is the refund policy?",
  "search_mode": "hybrid",
  "total_results": 5,
  "results": [
    {
      "content": "Our refund policy allows returns within 30 days...",
      "score": 0.87,
      "source": "policies/refunds.md",
      "breadcrumb": "Policies > Refund Policy > Standard Returns",
      "section_id": "2.1.1",
      "chunk_index": 3,
      "is_exact_match": false
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `query` | `string` | Echo of original query |
| `search_mode` | `string` | Effective search mode used |
| `total_results` | `number` | Count of results returned |
| `results[].content` | `string` | Chunk text (truncated to 500 tokens for token efficiency) |
| `results[].score` | `number` | Fused relevance score, 0.0-1.0 |
| `results[].source` | `string` | Source file path |
| `results[].breadcrumb` | `string` | Heading hierarchy as `" > "` separated string |
| `results[].section_id` | `string` | Dot-notation section ID |
| `results[].chunk_index` | `number` | Position in source document |
| `results[].is_exact_match` | `boolean` | Whether exact substring match found |

### Degraded Response (partial modality failure)

Same structure as success, with additional fields:

```json
{
  "query": "...",
  "search_mode": "hybrid",
  "total_results": 3,
  "degraded": true,
  "degraded_details": "Keyword search unavailable: OpenSearch connection refused at localhost:9200. Returning semantic-only results.",
  "results": [...]
}
```

### Error Response

Returned via `CallToolResult` with `isError: true`:

```json
{
  "content": [{ "type": "text", "text": "Search failed: Embedding provider unreachable (Ollama at localhost:11434)" }],
  "isError": true
}
```

**Error categories:**
| Category | Example | `isError` |
|---|---|---|
| Tool failure | Embedding provider down, all backends unreachable | `true` |
| Partial degradation | One search modality unavailable | `false` (degraded flag) |
| Empty results | No results above min_score | `false` (total_results: 0) |
| Invalid input | Zod validation failure | Handled by SDK automatically |

## Token Efficiency

- `breadcrumb` is a flat string (`" > "` separator) instead of nested array — saves ~40% tokens vs JSON array
- `content` is truncated to 500 tokens max with `...` suffix
- Individual modality scores (`semantic_score`, `keyword_score`) are omitted from tool output (available internally for logging/telemetry only)
- No embedding vectors in output

## Lifecycle

1. **Agent starts** → Tool config loaded from YAML → Zod validation
2. **First query** → Lazy initialization: connect to backends, ingest documents, build indexes
3. **Subsequent queries** → Search against existing indexes
4. **Agent session ends** → `close()` called on all backends

Lazy initialization avoids blocking agent startup when the vectorstore has a large corpus. The first search query triggers ingestion if not already done.
