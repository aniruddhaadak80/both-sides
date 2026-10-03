# Security policy

## Supported versions

Only the latest commit on `main` is supported.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's
private reporting on the Security tab of
<https://github.com/aniruddhaadak80/both-sides>, or email the maintainer.

Include the affected route, the request you made, and what you expected to
happen. You will get an acknowledgement within a few days.

## What this app holds

- **No accounts.** A random scope id lives in an HTTP-only, SameSite=Lax cookie
  and scopes every ruling, import and audit query.
- **No secrets in the client bundle.** Read and write tokens are read only in
  server modules and are never prefixed with `NEXT_PUBLIC_`.
- **User input is bounded.** Strings are length-limited, entity ids must match
  `^Q\d+$`, and every database statement is parameterised.
- **Renders are escaped.** All interpolated values are plain React text; there is
  no `dangerouslySetInnerHTML` anywhere in the project.

## Known limitations, stated plainly

- **Anonymous writes are best-effort rate limited.** There is no account and no
  paid rate limiter, so controls are limited to input bounds and payload size. On
  a serverless runtime, IP-based limiting is best effort and can be bypassed. A
  production deployment that expects sustained abuse should put a hosted limiter
  in front of the write routes.
- **The dataset is public.** The Content Lake dataset is readable by anyone who
  knows the project id. That is fine for published reference data and is why no
  token is required to read. Do not put private data in it.
- **Exports are not signed.** A Markdown or JSON export carries the seal chain so
  a reader can detect edits inside this app, but there is no cryptographic
  signature over the file itself. Verify against the live chain, not the file.

## Out of scope

Both Sides ranks claims and records a human decision. It does not verify that a
value is true, and it is not an authority on any dataset. Report a wrong figure
as a data issue, not a security issue.