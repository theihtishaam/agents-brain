# Agent Shadow Brain 7.25.0 context evaluation

Paired runs used the same author-generated corpus and options for each case. Each profile assembled context from the compiled package after its isolated JSON store had loaded.

| Profile | Cases passed | Context recall@5 | Context MRR@5 | Scope leaks | Budget violations | Median assembly |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| legacy | 6 / 14 | 0.679 | 0.731 | 0 / 1 | 0 | 0.244 ms |
| adaptive | 14 / 14 | 1.000 | 1.000 | 0 / 1 | 0 | 1.223 ms |

| Fixture | Records | Legacy checks | Adaptive checks |
| --- | ---: | --- | --- |
| Exact lexical control | 2 | Pass | Pass |
| No lexical evidence | 1 | Pass | Pass |
| Exact Java match and metadata boundary | 3 | excludes forbidden IDs, ranks expected record first | Pass |
| Late identifier remains visible in the excerpt | 1 | shows expected passage in the excerpt | Pass |
| Exact duplicates leave room for a distinct checksum lesson | 205 | includes relevant IDs, preserves reference and original memory ID | Pass |
| Whole camelCase query matches snake_case | 2 | includes relevant IDs, ranks expected record first | Pass |
| Whole snake_case query matches PascalCase | 2 | includes relevant IDs, ranks expected record first | Pass |
| Relative query matches a recorded Windows source reference | 2 | excludes forbidden IDs | Pass |
| Unicode text and code punctuation | 2 | Pass | Pass |
| Cross-project setting alone preserves project scope | 2 | Pass | Pass |
| Both cross-project gates permit labeled origins | 2 | Pass | Pass |
| Archived, contested, and superseded states remain excluded | 4 | Pass | Pass |
| Recorded links stop at one hop and preserve contradiction caution | 6 | includes relevant IDs | Pass |
| Tight Unicode and code budget still shows the matched identifier | 1 | includes relevant IDs, shows expected passage in the excerpt | Pass |

Runtime used v24.15.0 on win32/x64. Each case has one warm-store assembly measurement per profile. The first profile alternates by case.

Recall and reciprocal rank use the first 5 selected context entries and explicit relevant IDs. The no-evidence case is evaluated as abstention. Candidate explanations and the new estimate method are checked only where the adaptive profile provides them.

- The author-generated fixtures target named behaviors and do not measure model answer quality or competitor performance.
- Token counts are profile-specific estimates and may differ from a receiving model’s tokenizer.
- Timing covers context assembly after loading each store and excludes initialization, packaging, UI, and model calls.
- Lexical variants and recorded links do not provide general semantic paraphrase retrieval or factual verification.

Run npm run build followed by node tools/evaluate-context.mjs to reproduce the paired JSON results.
