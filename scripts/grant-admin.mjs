#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Grant (or revoke) admin rights for the studio's Firebase Auth user.
//
//   node scripts/grant-admin.mjs studio@example.com            # grant
//   node scripts/grant-admin.mjs studio@example.com --revoke   # revoke
//   node scripts/grant-admin.mjs --list                        # list admins
//   node scripts/grant-admin.mjs --scrub-costs                 # move unitCost
//                                                              #   out of public docs
//
// The security rules (firebase/firestore.rules, firebase/storage.rules) only
// accept writes from users that are on the admin allowlist. Granting does two
// things for the given account:
//   1. sets the `admin: true` custom claim (picked up on the next sign-in), and
//   2. creates the allowlist document admins/{uid} (effective immediately).
//
// --scrub-costs migrates any `unitCost` fields that older app versions saved
// into the publicly-readable catalogueOverrides/{id} documents over to the
// admin-only inventoryPrivate/{id} collection.
//
// ── Credentials ──────────────────────────────────────────────────────────────
// Uses the Firebase Admin SDK (bypasses security rules). Provide a service
// account one of these ways:
//   • GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   (recommended)
//   • FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json
//   • FIREBASE_SERVICE_ACCOUNT='{ ...inline JSON... }'
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ARGS = process.argv.slice(2);
const REVOKE = ARGS.includes('--revoke');
const LIST = ARGS.includes('--list');
const SCRUB = ARGS.includes('--scrub-costs');
const EMAIL = ARGS.find((a) => !a.startsWith('--'));

// Returns { credential, saProject }. A pointed-to key file that does NOT
// exist is a hard error, and main() refuses a service account belonging to a
// different project than the target — an admin grant that lands on the wrong
// project leaves the real deployment rejecting every studio write.
async function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().startsWith('{')) {
    const sa = JSON.parse(inline);
    return { credential: cert(sa), saProject: sa.project_id || '' };
  }
  const file = inline || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) {
    if (!existsSync(file)) {
      throw new Error(`Service-account file not found: ${file} — fix FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS (refusing to fall back to application-default credentials).`);
    }
    const sa = JSON.parse(await readFile(file, 'utf8'));
    return { credential: cert(sa), saProject: sa.project_id || '' };
  }
  return { credential: applicationDefault(), saProject: '' };
}

async function main() {
  if (!EMAIL && !LIST && !SCRUB) {
    console.error('Usage: node scripts/grant-admin.mjs <email> [--revoke] | --list | --scrub-costs');
    process.exit(1);
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'malaya-catalogue';
  const { credential, saProject } = await loadCredential();
  if (saProject && saProject !== projectId) {
    throw new Error(`Service account belongs to project "${saProject}" but the target is "${projectId}" — nothing changed. Use that project's key, or set NEXT_PUBLIC_FIREBASE_PROJECT_ID deliberately.`);
  }
  console.log(`Target Firebase project: ${projectId}`);
  initializeApp({ credential, projectId });
  const db = getFirestore();

  if (LIST) {
    const snap = await db.collection('admins').get();
    if (snap.empty) { console.log('No admins on the allowlist.'); return; }
    for (const d of snap.docs) console.log(`  ${d.id}  ${d.data().email || ''}`);
    return;
  }

  if (SCRUB) {
    const snap = await db.collection('catalogueOverrides').get();
    let moved = 0;
    for (const d of snap.docs) {
      const { unitCost } = d.data();
      if (unitCost === undefined) continue;
      await db.doc(`inventoryPrivate/${d.id}`).set({ unitCost, _updated: Date.now() }, { merge: true });
      await d.ref.update({ unitCost: FieldValue.delete() });
      moved += 1;
      console.log(`  moved unitCost for ${d.id}`);
    }
    console.log(moved ? `✓ Moved ${moved} unitCost field(s) to inventoryPrivate.` : '✓ Nothing to scrub.');
    return;
  }

  const user = await getAuth().getUserByEmail(EMAIL);
  if (REVOKE) {
    await getAuth().setCustomUserClaims(user.uid, { admin: null });
    await db.doc(`admins/${user.uid}`).delete();
    console.log(`✓ Revoked admin for ${EMAIL} (${user.uid}).`);
  } else {
    await getAuth().setCustomUserClaims(user.uid, { admin: true });
    await db.doc(`admins/${user.uid}`).set({ email: EMAIL, granted: Date.now() });
    console.log(`✓ Granted admin to ${EMAIL} (${user.uid}).`);
    console.log('  The custom claim applies on their next sign-in; the allowlist doc is live now.');
  }
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1); });
