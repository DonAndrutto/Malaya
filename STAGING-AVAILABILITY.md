# Existing staging availability — read-only check, 15 October 2026

No clearly authorized, configured isolated staging environment was found.

- Both current and older Mac checkouts use `.firebaserc` default
  `malaya-catalogue`; `firebase.json` has rules paths only, no emulator setup.
- No local environment files beyond blank `.env.example` were found in those
  checkouts. The current process has no Firebase project override, emulator
  hosts, staging ID or E2E admin email/password.
- Vercel's existing `malaya` project returns an empty environment-variable list
  (`decrypt=false`, no hidden production entries) and no custom environments.
  The team project-name search returns only `malaya`.
- The already authenticated Firebase CLI successfully listed 10 accessible
  projects. Relevant names are production `malaya-catalogue` and the separate
  active `malaya-stock-tracker`. The latter has **zero registered apps** and
  no repository/preview configuration identifying it as staging. Its name and
  separation do not establish permission to mutate it as a test environment.

Missing to complete live authenticated Save/revalidation validation:

1. Identification of an existing project explicitly approved for isolated
   storefront validation (or an approved local Auth/Firestore emulator setup).
2. Its existing public web configuration wired to an isolated preview/build,
   with a confirmed project ID distinct from `malaya-catalogue`.
3. An existing authorized test-admin account/session in that isolated target,
   with the admin claim or allowlist required by `/api/revalidate`, plus test
   `siteSettings/content` data and compatible rules.

No projects, apps, credentials, permissions or rules were created/changed.
No Firebase content mutation or production editor test was attempted. PR #44
remains draft. The current preview continues to read production public data;
all mutation and authenticated purge tests run only through local fixtures.
