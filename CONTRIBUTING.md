# Contributing to Both Sides

Thanks for taking a look. This is a small project with a strict definition of
done: a change is finished when it is tested, typed, linted and explained.

## Getting set up

```bash
git clone https://github.com/aniruddhaadak80/both-sides.git
cd both-sides/web
npm install
npm run dev
```

There are **no required environment variables**. Without any, the app runs
against an embedded PGlite database and a sealed offline corpus. Production
needs `DATABASE_URL`; see `.env.example`.

The Sanity Studio is a separate package:

```bash
cd ../studio
npm install
npm run dev
```

## The checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # node:test, deterministic
npm run build       # production build
npm run verify:live # end-to-end HTTP journey against BASE_URL
```

All four must pass before a pull request is merged. CI runs them on Node 22.

## Things that will be rejected

- **A score that cannot be reproduced.** The precedence engine must stay
  deterministic and versioned. If you change a factor weight, change
  `ENGINE_VERSION` and update the tests that pin the behaviour.
- **A claim without a source.** Every value in the interface has to come from
  the upstream APIs through `src/lib/upstream.ts`, or from the sealed corpus
  with its capture date. Never invent a figure.
- **Silent fallback.** If the Content Lake or upstream read fails, say so in the
  `status` and `notice` fields. A fallback must never be presented as live.
- **A mutation that skips the service layer.** REST routes and MCP tools must go
  through `src/lib/repository.ts` so the audit chain stays complete.
- **A destructive delete.** Rulings are soft-deleted so a replay still works.

## Reporting a disagreement in the data

If the engine ranks a claim wrongly, that is usually a real finding rather than
a bug. Open an issue with the entity id, the property id and the two claim ids,
and say which source you believe should govern and why.

## Security

Do not report vulnerabilities in a public issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your work is licensed under the MIT licence.