#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Seed the Explore editorial system: 4 navigation Groups, 29 knowledge Topics
// and the initial product ↔ topic links (keyword match against the catalogue).
//
//   node scripts/seed-explore.mjs                # seed (skips existing docs)
//   node scripts/seed-explore.mjs --dry-run      # print what would be written
//   node scripts/seed-explore.mjs --force        # overwrite existing topic/group docs
//   node scripts/seed-explore.mjs --skip-links   # don't touch catalogueOverrides
//
// All topics seed as DRAFTS (published: false) — approved Phase 1 amendment:
// no thin placeholder pages get indexed; the studio publishes each topic from
// /admin → Explore once real content is ready. Groups seed published so the
// shelves are in place the moment the first topic goes live.
//
// Product links are written to catalogueOverrides/{id}.topics with arrayUnion
// (merge) — existing override fields and studio-added links are never touched.
// Re-running is safe: existing topic/group docs are skipped without --force.
//
// ── Credentials ──────────────────────────────────────────────────────────────
// Uses the Firebase Admin SDK (bypasses security rules), same as the other
// seed scripts. Provide a service account one of these ways:
//   • GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json  (recommended)
//   • FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json
//   • FIREBASE_SERVICE_ACCOUNT='{ ...inline JSON... }'
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry-run');
const FORCE = ARGS.includes('--force');
const SKIP_LINKS = ARGS.includes('--skip-links');

// ── The 29 seed topics ────────────────────────────────────────────────────────
// Each entry: slug, title, subtitle (romanised · Tibetan where apt), excerpt
// (doubles as the meta description), aliases (search & import matching), and
// `keywords` — regex fragments matched against product name+subtitle to derive
// the initial product links. `md` becomes the topic's single placeholder
// richText block; the studio replaces it with real content before publishing.

const TOPICS = [
  // — Eight Auspicious Symbols (Ashtamangala), traditional canonical order —
  {
    slug: 'parasol', title: 'The Precious Parasol', subtitle: 'Rinchen Dug · རིན་ཆེན་གདུགས',
    excerpt: 'The parasol shelters all beings from harm — the royal emblem of protection from suffering, held high above the worthy.',
    aliases: ['Precious Umbrella', 'Chattra', 'Rinchen Dug'],
    keywords: ['parasol', 'umbrella'],
    md: 'Held above kings and teachers alike, the precious parasol casts a cool shadow of protection. In the Ashtamangala — the Eight Auspicious Symbols — it stands for shelter from the heat of suffering and the harmful forces that follow it.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'golden-fish', title: 'The Golden Fish', subtitle: 'Sernya · གསེར་ཉ',
    excerpt: 'A pair of golden fish, swimming freely — fearlessness in the ocean of existence, and eyes that see through its depths.',
    aliases: ['Pair of Golden Fish', 'Matsya', 'Sernya'],
    keywords: ['fish'],
    md: 'The two golden fish once stood for the Ganges and Yamuna rivers; in Vajrayana Buddhism they came to mean beings who move through the ocean of samsara without drowning — fearless, spontaneous and free.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'treasure-vase', title: 'The Treasure Vase', subtitle: 'Bumpa · གཏེར་གྱི་བུམ་པ',
    excerpt: 'The vase of inexhaustible treasure — spiritual abundance that never runs dry, however much is given away.',
    aliases: ['Wealth Vase', 'Kalasha', 'Bumpa'],
    keywords: ['treasure vase', 'bumpa', '\\bvase\\b'],
    md: 'The treasure vase holds an inexhaustible store — no matter how much is drawn out, it remains full. It is the emblem of long life, prosperity and the endless wealth of the Dharma itself.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'lotus', title: 'The Lotus', subtitle: 'Pema · པདྨ',
    excerpt: 'Rooted in mud, blooming immaculate above the water — the lotus is purity rising untouched through the world.',
    aliases: ['Padma', 'Pema', 'Lotus Flower'],
    keywords: ['lotus', 'padma', '\\bpema\\b'],
    md: 'The lotus grows from the darkest mud yet opens spotless above the water line. It is the most beloved image of the awakened mind: purity that is not apart from the world, but blossoms out of it.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'conch', title: 'The Conch Shell', subtitle: 'Dungkar · དུང་དཀར',
    excerpt: 'The white conch, spiralling rightward, sounds the fearless proclamation of the Dharma in all directions.',
    aliases: ['White Conch', 'Shankha', 'Dungkar'],
    keywords: ['conch'],
    md: 'Blown as a horn since the oldest of times, the right-turning white conch announces the teachings of the Buddha — a sound said to awaken beings from the deep sleep of ignorance.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'endless-knot', title: 'The Endless Knot', subtitle: 'Palbeu · དཔལ་བེའུ',
    excerpt: 'A single thread with no beginning and no end — the endless knot weaves wisdom and compassion into one inseparable design.',
    aliases: ['Eternal Knot', 'Shrivatsa', 'Palbeu', 'Glorious Knot'],
    keywords: ['endless knot', 'eternal knot'],
    md: 'Trace the endless knot and you never find where it starts: one continuous thread folding through itself. It stands for the interdependence of all things, and for the union of wisdom and compassion at the heart of the path.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'victory-banner', title: 'The Victory Banner', subtitle: 'Gyaltsen · རྒྱལ་མཚན',
    excerpt: 'Raised on the summit of Mount Meru, the banner proclaims the victory of wisdom over ignorance.',
    aliases: ['Banner of Victory', 'Dhvaja', 'Gyaltsen'],
    keywords: ['victory banner', 'banner'],
    md: 'The victory banner marks the Buddha’s triumph over the four maras — the obstacles of pride, desire, disturbing emotions and the fear of death. On Bhutanese rooftops it flies in the four directions.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'dharma-wheel', title: 'The Wheel of Dharma', subtitle: 'Chökyi Khorlo · ཆོས་ཀྱི་འཁོར་ལོ',
    excerpt: 'Eight spokes for the Eightfold Path — the wheel that has been turning since the first teaching at Sarnath.',
    aliases: ['Dharmachakra', 'Wheel of Law', 'Chökyi Khorlo', 'Khorlo'],
    keywords: ['dharma wheel', 'dharmachakra', 'wheel'],
    md: 'When the Buddha first taught, he was said to have “turned the wheel of the Dharma.” Its eight spokes are the Noble Eightfold Path; its hub is discipline; its rim, the concentration that holds practice together.\n\n*This page is a draft — the studio is preparing the full story.*',
  },

  // — Sacred Symbols (beyond the eight) —
  {
    slug: 'kalachakra', title: 'The Kalachakra Seal', subtitle: 'Namchu Wangden · རྣམ་བཅུ་དབང་ལྡན',
    excerpt: 'The Tenfold Powerful One — seven syllables and three signs interwoven into the great seal of the Wheel of Time.',
    aliases: ['Kalachakra', 'Tenfold Powerful One', 'Namchu Wangden', 'Wheel of Time'],
    keywords: ['kalachakra', 'namchu'],
    md: 'The Kalachakra monogram interlaces the seed syllables of the Wheel of Time tantra into a single emblem of protection and cosmic order — among the most intricate designs in all of Vajrayana art.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'mandala', title: 'The Mandala', subtitle: 'Kyilkhor · དཀྱིལ་འཁོར',
    excerpt: 'A palace of perfect symmetry seen from above — the mandala maps the enlightened world and the mind that beholds it.',
    aliases: ['Kyilkhor', 'Sacred Circle'],
    keywords: ['mandala'],
    md: 'A mandala is at once a diagram of the cosmos, the floor plan of a deity’s palace, and a mirror of the practitioner’s own mind brought into perfect order.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'sun-and-moon', title: 'Sun and Moon', subtitle: 'Nyima Dawa · ཉི་ཟླ',
    excerpt: 'Nyima and Dawa — the sun and moon joined, method and wisdom united, the two lights that never quarrel in one sky.',
    aliases: ['Nyima and Dawa', 'Nyi-Da', 'Nyima', 'Dawa'],
    keywords: ['sun and moon', 'nyima', '\\bdawa\\b'],
    md: 'Crowning stupas and prayer flags across the Himalayas, the joined sun and moon stand for the union of opposites: wisdom and compassion, the relative and the absolute.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'garuda', title: 'The Garuda', subtitle: 'Khyung · ཁྱུང',
    excerpt: 'The great bird that hatches full-grown — the garuda soars beyond obstacles the moment it breaks the shell.',
    aliases: ['Khyung', 'Khading'],
    keywords: ['garuda', 'khyung'],
    md: 'Unlike other birds, the garuda is said to emerge from its egg fully grown, wings spread. It is the image of primordial awareness — complete from the very beginning — and a fierce remover of obstacles.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'kapala', title: 'The Kapala', subtitle: 'Thöpa · ཐོད་པ',
    excerpt: 'The skull cup of the tantric adept — impermanence held in the palm, transformed into the vessel of great bliss.',
    aliases: ['Skull Cup', 'Thöpa', 'Skull'],
    keywords: ['kapala', 'skull'],
    md: 'In tantric iconography the kapala, or skull cup, turns the starkest reminder of impermanence into a ritual vessel. What frightens the ordinary eye becomes, for the practitioner, a container of transformation.\n\n*This page is a draft — the studio is preparing the full story.*',
  },

  // — Sacred Seed Syllables —
  {
    slug: 'om', title: 'Om', subtitle: 'ༀ · the primordial syllable',
    excerpt: 'The seed of all sound — Om opens mantras across every tradition, the vibration from which speech and world unfold.',
    aliases: ['Aum', 'Om Syllable'],
    keywords: ['\\bom\\b'],
    md: 'Om is the opening breath of nearly every mantra — the sound before meaning, standing for the body, speech and mind of all the buddhas gathered into a single syllable.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'ah', title: 'Ah', subtitle: 'ཨཿ · the syllable of speech',
    excerpt: 'Ah — the open vowel at the heart of speech, the natural sound of the uncontrived mind.',
    aliases: ['Ah Syllable', 'A'],
    keywords: ['\\bah\\b'],
    md: 'Ah is the simplest of all utterances — the sound the mouth makes when nothing is forced. In Vajrayana it is the seed of enlightened speech and the emblem of emptiness itself.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'hung', title: 'Hung', subtitle: 'ཧཱུྃ · the syllable of mind',
    excerpt: 'Hung — the thunder of the awakened mind, seed syllable of Guru Rinpoche and the wrathful protectors.',
    aliases: ['Hum', 'Hūṃ', 'Hung Syllable'],
    keywords: ['\\bhung\\b', '\\bhum\\b'],
    md: 'Hung condenses the enlightened mind into one charged syllable. It closes the mantra of Chenrezig, opens the heart practice of Guru Rinpoche, and marks the indestructible core of awareness.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'tam', title: 'Tam', subtitle: 'ཏཾ · seed syllable of Tara',
    excerpt: 'Tam — the green seed of Tara, the swift mother of liberation, protector from the eight fears.',
    aliases: ['Tām', 'Tam Syllable', 'Tara'],
    keywords: ['\\btam\\b', '\\btara\\b'],
    md: 'From the syllable Tam arises Tara, the swift liberator. Meditators visualise it glowing green at the heart — the seed from which the mother of all buddhas appears.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'hri', title: 'Hri', subtitle: 'ཧྲཱིཿ · seed syllable of Chenrezig',
    excerpt: 'Hri — the radiant seed of Chenrezig and Amitabha, the essence of compassion condensed into a single sign.',
    aliases: ['Hrih', 'Hri Syllable'],
    keywords: ['\\bhri\\b', '\\bhrih\\b'],
    md: 'Hri is the heart syllable of Chenrezig, the Buddha of Compassion, and of Amitabha, the Buddha of Boundless Light. It is compassion in its most concentrated written form.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'dhi', title: 'Dhi', subtitle: 'དྷཱིཿ · seed syllable of Manjushri',
    excerpt: 'Dhi — the seed of Manjushri, recited to sharpen memory, eloquence and the sword-edge of discriminating wisdom.',
    aliases: ['Dhih', 'Dhi Syllable'],
    keywords: ['\\bdhi\\b'],
    md: 'Students across the Himalayas recite Dhi in long chains to sharpen the mind. It is the seed syllable of Manjushri, whose flaming sword cuts through confusion.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'bam', title: 'Bam', subtitle: 'བཾ · seed syllable of Vajravarahi',
    excerpt: 'Bam — the seed syllable of Vajravarahi, the red dakini of transformed passion and blazing inner heat.',
    aliases: ['Bam Syllable'],
    keywords: ['\\bbam\\b'],
    md: 'Bam is the seed of Vajravarahi, foremost of the dakinis. In the inner yogas it marks the point where ordinary passion is transmuted into blazing wisdom.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'dzam', title: 'Dzam', subtitle: 'ཛཾ · seed syllable of Dzambhala',
    excerpt: 'Dzam — the golden seed of Dzambhala, deity of wealth held in trust for generosity.',
    aliases: ['Dzam Syllable', 'Dzambhala'],
    keywords: ['\\bdzam\\b'],
    md: 'Dzam invokes Dzambhala, the guardian of wealth — riches understood not as possession but as the freedom to be generous without hesitation.\n\n*This page is a draft — the studio is preparing the full story.*',
  },

  // — Ritual Objects —
  {
    slug: 'vajra', title: 'The Vajra', subtitle: 'Dorje · རྡོ་རྗེ',
    excerpt: 'The diamond-thunderbolt — indestructible, irresistible; the very name of the Vajrayana path.',
    aliases: ['Dorje', 'Thunderbolt', 'Double Dorje', 'Vishvavajra'],
    keywords: ['vajra', 'dorje'],
    md: 'The vajra, or dorje, is at once diamond and thunderbolt: nothing can cut it, and nothing withstands it. Held in the right hand with the bell in the left, it embodies method and compassion.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'ritual-bell', title: 'The Ritual Bell', subtitle: 'Drilbu · དྲིལ་བུ',
    excerpt: 'The bell whose sound is emptiness — wisdom ringing in the left hand, inseparable from the vajra in the right.',
    aliases: ['Ghanta', 'Drilbu', 'Bell'],
    keywords: ['\\bbell\\b', 'ghanta', 'drilbu'],
    md: 'The drilbu’s clear ring arises and dissolves without a trace — the sound of emptiness itself. Paired with the vajra, it completes the union at the heart of every Vajrayana ritual.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'phurba', title: 'The Phurba', subtitle: 'ཕུར་པ · the ritual dagger',
    excerpt: 'The three-sided dagger that pins down the three poisons — a tool of unmoving stability, not of harm.',
    aliases: ['Kila', 'Kilaya', 'Ritual Dagger'],
    keywords: ['phurba', 'kila'],
    md: 'The phurba’s three-sided blade transfixes ignorance, attachment and aversion. Driven point-down, it nails negativity to the spot and consecrates the ground it stands in.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'drigug', title: 'The Drigug', subtitle: 'གྲི་གུག · the crescent knife',
    excerpt: 'The hooked crescent knife of the dakinis, severing attachment at the root in one clean stroke.',
    aliases: ['Kartika', 'Curved Knife', 'Flaying Knife'],
    keywords: ['drigug', 'kartika'],
    md: 'Held aloft by the wisdom dakinis, the drigug’s crescent blade cuts through clinging and self-deception — a surgeon’s instrument for the ego, crowned with a small vajra handle.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'mala', title: 'The Mala', subtitle: 'Trengwa · ཕྲེང་བ',
    excerpt: 'One hundred and eight beads through the fingers — the mala keeps the count while the mantra keeps the mind.',
    aliases: ['Prayer Beads', 'Trengwa', 'Rosary'],
    keywords: ['\\bmala\\b'],
    md: 'The mala’s 108 beads pass through the fingers as the mantra turns — each bead a recitation, each circuit an offering. The guru bead marks the point of return.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'gau', title: 'The Gau', subtitle: 'གའུ · the amulet box',
    excerpt: 'A portable shrine worn over the heart — the gau carries blessings, relics and protection wherever its wearer goes.',
    aliases: ['Ghau', 'Amulet Box', 'Prayer Box'],
    keywords: ['\\bgau\\b', 'ghau'],
    md: 'Travellers and pilgrims across the Himalayas wear the gau at the chest: a small shrine holding sacred images, rolled mantras or a lama’s blessing — the temple carried over the heart.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'melong', title: 'The Melong', subtitle: 'མེ་ལོང · the mirror',
    excerpt: 'The polished mirror that reflects everything and holds nothing — the emblem of mind’s own clear nature.',
    aliases: ['Mirror', 'Divination Mirror'],
    keywords: ['melong'],
    md: 'The melong reflects every face shown to it yet is stained by none. Worn as an ornament or used in divination, it points to the mind’s mirror-like clarity beneath all appearances.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
  {
    slug: 'stupa', title: 'The Stupa', subtitle: 'Chörten · མཆོད་རྟེན',
    excerpt: 'The monument of the awakened mind — earth, water, fire, air and space stacked into a single sacred form.',
    aliases: ['Chorten', 'Chörten'],
    keywords: ['stupa', 'chorten'],
    md: 'From its square base to its crowning sun and moon, every tier of the stupa maps an element and a stage of the path. To walk around one is to circle the Buddha’s own mind.\n\n*This page is a draft — the studio is preparing the full story.*',
  },
];

// ── The 4 seed groups (ordered shelves; slugs must avoid RESERVED words) ──────
const GROUPS = [
  {
    slug: 'eight-auspicious-symbols', name: 'Eight Auspicious Symbols', order: 1,
    description: 'The Ashtamangala — eight sacred emblems of good fortune, presented here in their traditional order, from the precious parasol to the wheel of Dharma.',
    topicSlugs: ['parasol', 'golden-fish', 'treasure-vase', 'lotus', 'conch', 'endless-knot', 'victory-banner', 'dharma-wheel'],
  },
  {
    slug: 'sacred-symbols', name: 'Sacred Symbols', order: 2,
    description: 'Emblems at the heart of Bhutanese and Vajrayana visual culture — knots without end, wheels, mandalas and the guardians drawn from the sky.',
    topicSlugs: ['endless-knot', 'dharma-wheel', 'lotus', 'kalachakra', 'mandala', 'sun-and-moon', 'garuda', 'kapala'],
  },
  {
    slug: 'seed-syllables', name: 'Sacred Seed Syllables', order: 3,
    description: 'Single written syllables that hold an entire deity, prayer or state of mind — the calligraphic heart of the Malaya collection.',
    topicSlugs: ['om', 'ah', 'hung', 'tam', 'hri', 'dhi', 'bam', 'dzam'],
  },
  {
    slug: 'ritual-objects', name: 'Ritual Objects', order: 4,
    description: 'Implements of daily practice and high ritual — vajra and bell, dagger and mirror — each one a teaching cast in metal.',
    topicSlugs: ['vajra', 'ritual-bell', 'phurba', 'drigug', 'mala', 'gau', 'melong', 'stupa'],
  },
];

// ── Catalogue extraction ─────────────────────────────────────────────────────
// The lib data modules can't be imported directly under plain Node (their
// import chain pulls in a JSON module), so read the two literal tables out of
// the source instead. Rows are plain array literals of strings/numbers/null.
// Stock-ledger lines are matched too: a standalone line links under its own
// SKU (it publishes as a first-class product keyed by SKU); a line linked to
// catalogue products writes to those canonical ids instead — the storefront
// only ever reads `topics` from the id a piece actually lists under.
async function loadCatalogueItems() {
  const items = [];
  const productsSrc = await readFile(path.join(ROOT, 'lib/data/products.js'), 'utf8');
  const rawMatch = productsSrc.match(/const RAW = \[([\s\S]*?)\n\];/);
  if (rawMatch) {
    // [id, name, sub, file, tag, category, hue]
    new Function(`return [${rawMatch[1]}]`)()
      .forEach(([id, name, sub]) => items.push({ id, name: name || '', sub: sub || '' }));
  }
  const siteSrc = await readFile(path.join(ROOT, 'lib/data/site-data.js'), 'utf8');
  const extraMatch = siteSrc.match(/const SITE_EXTRA = \[([\s\S]*?)\n\];/);
  if (extraMatch) {
    // [id, name, sub, file, category]
    new Function(`return [${extraMatch[1]}]`)()
      .forEach(([id, name, sub]) => items.push({ id, name: name || '', sub: sub || '' }));
  }
  if (!items.length) throw new Error('Could not extract the catalogue tables from lib/data — aborting.');
  const seen = new Set(items.map((i) => i.id));
  const ledger = JSON.parse(await readFile(path.join(ROOT, 'lib/data/stock-ledger.json'), 'utf8'));
  ledger.forEach((row) => {
    if (!row || !row.sku) return;
    const targets = Array.isArray(row.productIds) && row.productIds.length ? row.productIds : [row.sku];
    targets.forEach((id) => {
      if (seen.has(id)) return; // its own name row already covers it
      seen.add(id);
      items.push({ id, name: row.name || '', sub: row.material || '' });
    });
  });
  return items;
}

// keyword fragment → RegExp: fragments may carry their own \b anchors; bare
// words/phrases get word boundaries added.
function keywordRegex(kw) {
  const src = /\\b/.test(kw) ? kw : `\\b${kw.replace(/[.*+?^${}()|[\]]/g, '\\$&')}\\b`;
  return new RegExp(src, 'i');
}

function matchTopics(items) {
  const matchers = TOPICS.map((t) => ({ slug: t.slug, regexes: t.keywords.map(keywordRegex) }));
  const byProduct = {}; // productId → [topicSlug]
  const byTopic = {}; // topicSlug → count (report)
  items.forEach(({ id, name, sub }) => {
    const text = `${name} ${sub}`;
    const slugs = matchers.filter((m) => m.regexes.some((r) => r.test(text))).map((m) => m.slug).slice(0, 20);
    if (slugs.length) {
      byProduct[id] = slugs;
      slugs.forEach((s) => { byTopic[s] = (byTopic[s] || 0) + 1; });
    }
  });
  return { byProduct, byTopic };
}

// ── Credentials / main ───────────────────────────────────────────────────────
// Returns { credential, saProject }. A pointed-to key file that does NOT exist
// is a hard error (silently falling back to application-default credentials is
// how a seed ends up writing to whatever project the local gcloud/CLI has
// active — the wrong-project foot-gun). saProject lets main() refuse a service
// account that belongs to a different project than the target.
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
  // Sanity: every group slug avoids the reserved route words, every listed
  // topic exists, and the multi-parent proof holds (3 topics on two shelves).
  const topicSlugs = new Set(TOPICS.map((t) => t.slug));
  for (const g of GROUPS) {
    if (['topic', 'search'].includes(g.slug)) throw new Error(`Group slug "${g.slug}" is reserved.`);
    for (const s of g.topicSlugs) if (!topicSlugs.has(s)) throw new Error(`Group "${g.slug}" lists unknown topic "${s}".`);
  }
  const shelfCount = {};
  GROUPS.forEach((g) => g.topicSlugs.forEach((s) => { shelfCount[s] = (shelfCount[s] || 0) + 1; }));
  const multi = Object.keys(shelfCount).filter((s) => shelfCount[s] > 1).sort();

  const items = await loadCatalogueItems();
  const { byProduct, byTopic } = matchTopics(items);
  const unlinked = TOPICS.filter((t) => !byTopic[t.slug]).map((t) => t.slug);

  console.log(`Seed plan: ${GROUPS.length} groups · ${TOPICS.length} topics (all drafts) · ${Object.keys(byProduct).length} product links`);
  console.log(`  multi-shelf topics: ${multi.join(', ')}`);
  if (unlinked.length) console.log(`  topics with no keyword-matched product yet: ${unlinked.join(', ')}`);

  if (DRY) {
    TOPICS.forEach((t) => console.log(`  ${t.slug.padEnd(24)} ${String(byTopic[t.slug] || 0).padStart(3)} product(s)`));
    console.log('Dry run — nothing written.');
    return;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'malaya-catalogue';
  const { credential, saProject } = await loadCredential();
  if (saProject && saProject !== projectId) {
    throw new Error(`Service account belongs to project "${saProject}" but the seed targets "${projectId}" — nothing written. Use that project's key, or set NEXT_PUBLIC_FIREBASE_PROJECT_ID to seed "${saProject}" deliberately.`);
  }
  console.log(`Target Firebase project: ${projectId}`);
  initializeApp({ credential, projectId });
  const db = getFirestore();

  let wrote = 0; let skipped = 0;
  for (const t of TOPICS) {
    const ref = db.doc(`exploreTopics/${t.slug}`);
    if (!FORCE && (await ref.get()).exists) { skipped += 1; continue; }
    await ref.set({
      slug: t.slug,
      title: t.title,
      subtitle: t.subtitle,
      excerpt: t.excerpt,
      aliases: t.aliases,
      blocks: [{ id: `b-seed-${t.slug}`, type: 'richText', md: t.md }],
      published: false, // drafts by decision — the studio publishes when ready
      _updated: Date.now(),
    });
    wrote += 1;
  }
  console.log(`✓ Topics: ${wrote} written, ${skipped} already existed${FORCE ? '' : ' (kept — use --force to overwrite)'}.`);

  wrote = 0; skipped = 0;
  for (const g of GROUPS) {
    const ref = db.doc(`exploreGroups/${g.slug}`);
    if (!FORCE && (await ref.get()).exists) { skipped += 1; continue; }
    await ref.set({
      slug: g.slug,
      name: g.name,
      description: g.description,
      order: g.order,
      topicSlugs: g.topicSlugs,
      published: true,
      _updated: Date.now(),
    });
    wrote += 1;
  }
  console.log(`✓ Groups: ${wrote} written, ${skipped} already existed.`);

  if (SKIP_LINKS) { console.log('Skipped product links (--skip-links).'); return; }
  let linked = 0;
  for (const [id, slugs] of Object.entries(byProduct)) {
    await db.doc(`catalogueOverrides/${id}`).set(
      { topics: FieldValue.arrayUnion(...slugs), _updated: Date.now() },
      { merge: true },
    );
    linked += 1;
  }
  console.log(`✓ Product links: topics merged into ${linked} catalogueOverrides docs (arrayUnion — studio edits untouched).`);
  console.log('Done. Deploy the updated rules first if you have not: firebase deploy --only firestore:rules');
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1); });
