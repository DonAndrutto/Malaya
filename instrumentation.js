// TEMPORARY — October 2026 security upgrade verification. REMOVE before the
// production candidate.
//
// Logs the actual Node.js version of the Vercel Function runtime (not the
// build image) once per cold start. Output goes only to the project's private
// Runtime Logs; nothing is added to any response, header or route.
const PATCHED_24 = [24, 22, 1];

export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [maj, min, pat] = process.versions.node.split('.').map(Number);
  const [pm, pn, pp] = PATCHED_24;
  const patched = maj > pm || (maj === pm && (min > pn || (min === pn && pat >= pp)));
  console.log(
    `[malaya-runtime-check] node=${process.version} openssl=${process.versions.openssl}`
    + ` patched_vs_24.22.1=${patched ? 'yes' : 'NO'} env=${process.env.VERCEL_ENV || 'local'}`
    + ` region=${process.env.VERCEL_REGION || '-'} commit=${(process.env.VERCEL_GIT_COMMIT_SHA || '-').slice(0, 7)}`,
  );
}
