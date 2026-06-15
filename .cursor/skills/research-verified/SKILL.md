---
name: research-verified
description: >-
  Researches libraries, APIs, and current web facts without hallucination.
  Uses Context7 MCP, web search, and fetch MCP before stating versions or APIs.
  Use when looking up docs, comparing frameworks, verifying API syntax, checking
  release notes, or answering "what's the current way to…" questions.
---

# Research Verified

## Golden rule

**Never invent API names, versions, config keys, or behavior.** If unverified, say so and fetch sources first.

## Research order

1. **Codebase first** — grep/read existing usage in this repo before proposing new patterns.
2. **Context7** (`user-context7` MCP) — official library docs:
   - Call `resolve-library-id` with the library name.
   - Call `query-docs` with the returned `libraryId` and a specific question.
   - Max 3 `query-docs` calls per question.
   - Common IDs: `/vercel/next.js`, `/websites/react_dev`, `/wevm/wagmi`, `/wevm/viem`, `/TanStack/query`.
3. **Web search** — release notes, breaking changes, ecosystem news not in Context7.
4. **Primary sources** (`user-fetch` MCP `fetch_url`) — official docs URLs, GitHub releases, Telegram Bot API pages.
5. **Browser** (`cursor-ide-browser`) — only for live UI verification or pages that block fetch.

## Citation

When research informs an answer or code change, cite:
- Library + version from docs (not memory)
- URL or Context7 library ID
- Repo file path when matching existing conventions

## Anti-patterns

| Do not | Do instead |
|--------|------------|
| Guess Next.js / React API from training data | `query-docs` for `/vercel/next.js` |
| State "use X hook" without checking wagmi/viem version | Read `package.json` + Context7 |
| Copy Stack Overflow snippets blindly | Verify against installed versions |
| Assume shadcn/Radix — this project has none | Read `globals.css` + `src/components/ui/` |

## Version anchor

Check `package.json` in repo root before recommending imports. Key stack: Next.js 16, React 19, wagmi 2, viem 2, Tailwind 3.

## When stuck

Say what was searched, what failed, and ask the user OR inspect the repo. Do not fill gaps with plausible-sounding fiction.
