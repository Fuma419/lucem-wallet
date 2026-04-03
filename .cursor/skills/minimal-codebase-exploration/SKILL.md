# Minimal Codebase Exploration

**Trigger:** Agent needs to understand code structure or locate a symbol/file.

## Rules
1. Start with `Grep` using a specific pattern and `glob`/`type` filter before reading any file.
2. Use `Glob` with a targeted pattern (e.g., `src/api/**/*.js`) — never `**/*`.
3. Read only the matched files, using `offset`/`limit` for files > 200 lines.
4. If an `explore` subagent is needed, set thoroughness to `"quick"` unless the question is architectural.
5. Cache key paths mentally — avoid re-searching for the same symbol twice in one session.

## Anti-patterns
- Reading every file in a directory "just in case."
- Using `find` or `ls -R` in Shell instead of `Glob`/`Grep`.
- Spawning an `explore` subagent for a single-symbol lookup.
