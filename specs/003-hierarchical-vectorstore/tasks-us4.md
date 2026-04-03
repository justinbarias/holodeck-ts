# Tasks — US4: Structure-Aware Chunking with Hierarchy Preservation

> **User Story 4**: Complex markdown documents with nested headings are parsed respecting heading levels, preserving parent chain (ancestor headings), assigning section IDs, splitting at logical boundaries rather than arbitrary token counts.
>
> **Depends on**: tasks-foundation.md (chunker already implemented)
>
> **Priority**: P2

---

## Test Fixtures

- [ ] [T400] [P] [US4] Create `tests/fixtures/docs/simple-headings.md` with basic h1/h2/h3 structure covering multiple sections and subsections
- [ ] [T401] [P] [US4] Create `tests/fixtures/docs/deep-nesting.md` with h1 through h6 nested headings exercising full depth
- [ ] [T402] [P] [US4] Create `tests/fixtures/docs/skipped-levels.md` with non-contiguous heading levels (h1->h3->h5, h2->h4)
- [ ] [T403] [P] [US4] Create `tests/fixtures/docs/no-headings.md` with plain paragraphs only, no heading markup
- [ ] [T404] [P] [US4] Create `tests/fixtures/docs/empty-sections.md` with headings that have no content before the next heading
- [ ] [T405] [P] [US4] Create `tests/fixtures/docs/large-section.md` with a single section containing content exceeding max_chunk_tokens (800+)
- [ ] [T406] [P] [US4] Create `tests/fixtures/docs/code-and-tables.md` with fenced code blocks and GFM tables that must not be split mid-block
- [ ] [T407] [P] [US4] Create `tests/fixtures/docs/mixed-content.md` as a realistic complex document combining headings, lists, code blocks, tables, and inline formatting

## Edge Case Handling in Chunker

- [ ] [T408] [US4] Handle documents with no headings in `src/tools/vectorstore/chunker.ts` — all content assigned to a root section with empty parent_chain
- [ ] [T409] [US4] Handle content before the first heading in `src/tools/vectorstore/chunker.ts` — preamble text captured as a root-level chunk
- [ ] [T410] [US4] Handle deeply nested headings (h1->h2->h3->h4->h5->h6) in `src/tools/vectorstore/chunker.ts` — parent_chain includes all ancestor headings up to h1
- [ ] [T411] [US4] Handle skipped heading levels (h1->h3, no h2) in `src/tools/vectorstore/chunker.ts` — parent_chain reflects actual headings present, section_id dot-notation still correct
- [ ] [T412] [US4] Handle empty sections (heading with no body) in `src/tools/vectorstore/chunker.ts` — produce a HEADER-only chunk with no CONTENT chunk following it
- [ ] [T413] [US4] Handle very long paragraphs exceeding max_chunk_tokens in `src/tools/vectorstore/chunker.ts` — split at sentence boundaries, never mid-word or mid-sentence
- [ ] [T414] [US4] Preserve code blocks as atomic units in `src/tools/vectorstore/chunker.ts` — fenced code blocks are never split across chunks
- [ ] [T415] [US4] Preserve GFM tables as atomic units in `src/tools/vectorstore/chunker.ts` — tables are never split across chunks
- [ ] [T416] [US4] Handle long lists spanning many tokens in `src/tools/vectorstore/chunker.ts` — split between list items, never mid-item

## Validation Tests — Parent Chain and Section IDs

- [ ] [T417] [P] [US4] Add parent_chain and section_id tests in `tests/unit/tools/vectorstore/chunker.test.ts` — verify: parent_chain correctness for `simple-headings.md` (ancestry matches), `deep-nesting.md` (h6 has [h1..h5]), `skipped-levels.md` (no phantom parents); section_id dot-notation (1, 1.1, 1.1.1, 1.2, 2); subsection_ids populated (each parent lists direct children)

## Validation Tests — Chunk Types and Token Bounds

- [ ] [T418] [P] [US4] Add chunk type and token bound tests in `tests/unit/tools/vectorstore/chunker.test.ts` — verify: chunk_type HEADER vs CONTENT assignment, all structure-mode chunks within max_chunk_tokens, `large-section.md` splits into multiple valid chunks, sentence-boundary splitting (no mid-sentence cuts)

## Validation Tests — Token-Mode Chunking

- [ ] [T419] [P] [US4] Add token-mode chunking tests in `tests/unit/tools/vectorstore/chunker.test.ts` — verify: `chunking_strategy: token` ignores heading structure and splits by token count, `chunk_overlap: 50` produces ~50 token overlap between consecutive chunks, `mixed-content.md` chunks have consistent sizes within tolerance

## Validation Tests — Atomic Block Preservation

- [ ] [T420] [P] [US4] Add atomic block preservation tests in `tests/unit/tools/vectorstore/chunker.test.ts` — verify: code blocks in `code-and-tables.md` never split across chunks, GFM tables never split across chunks, `no-headings.md` produces chunks with empty parent_chain and root section_id

## Validation Tests — Edge Combinations

- [ ] [T421] [US4] Add edge combination tests in `tests/unit/tools/vectorstore/chunker.test.ts` — verify: `empty-sections.md` produces HEADER chunks with no orphaned CONTENT, `mixed-content.md` end-to-end with structure-mode (correct parent_chains, section_ids, chunk_types, and token bounds simultaneously)

## Checkpoint

- [ ] [T422] [US4] Verify all US4 tests pass (`bun test tests/unit/tools/vectorstore/chunker.test.ts`) — chunker handles all edge cases in real-world markdown with correct hierarchy preservation
