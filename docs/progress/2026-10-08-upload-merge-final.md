# Upload merge verification — 2026-10-08

The implemented upload branch at `32317a4` was merged with dashboard commit
`c92128f` in `f6ca19e`. Both sets of functionality run through NextAuth and the
canonical PostgreSQL Pool, with parsers, preview/confirm, templates, tests,
dashboard CSV adapters, marks, appointments, and voice dispatch retained.

The later upload commit `114a3c9` changes documentation, dependency versions,
and Next.js generated declarations, but adds no ingestion implementation.
Its changed files are preserved verbatim under
`docs/upload-branch/updates-114a3c9/`. The active application retains the
repository's current PostgreSQL/NextAuth contract rather than adopting that
commit's proposed, unimplemented Convex migration or second ORM.

Verification: parser/risk tests (9 passing), production build, branch ancestry,
and byte comparisons of preserved templates/schema sources. Live database
and hosted upload smoke testing still require deployment configuration.
