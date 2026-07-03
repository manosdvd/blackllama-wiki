import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const HANDBOOK_PATH = path.join(process.cwd(), 'Camp_Lawton_Staff_Handbook.json');
const SONGS_DIR = path.join(process.cwd(), 'songs');
const LOCAL_SERVICE_ACCOUNT = path.join(process.cwd(), 'camp-lawton-staff-hub-firebase-adminsdk-fbsvc-439f443121.json');
const writeMode = process.argv.includes('--write');

let blockCounter = 0;

const sectionMap = [
  {
    key: 'leadership_directory',
    title: 'Leadership Directory',
    categoryId: 'camp-culture-history',
    summary: 'Camp and council leadership reference from the staff handbook.',
    visibility: 'staff',
  },
  {
    key: 'camp_address',
    title: 'Camp Address and Mail',
    categoryId: 'resources',
    summary: 'Camp Lawton mailing address and contact reference.',
    visibility: 'candidate',
  },
  {
    key: 'part_1_camp_staff_training_and_culture',
    title: 'Camp Staff Training and Culture',
    categoryId: 'training',
    summary: 'Mission, culture, chain of command, staff duties, and training expectations.',
    visibility: 'staff',
  },
  {
    key: 'part_2_policies_procedures_guidelines_and_laws',
    title: 'Policies, Procedures, Guidelines, and Laws',
    categoryId: 'policies-procedures',
    summary: 'Operational policies and staff conduct guidance from the handbook.',
    visibility: 'staff',
  },
  {
    key: 'part_3_campfire_master_class_and_songbook',
    title: 'Campfire Master Class and Songbook',
    categoryId: 'songbook',
    summary: 'Campfire program guidance, songs, and camp culture material.',
    visibility: 'staff',
  },
  {
    key: 'part_4_onboarding',
    title: 'Staff Onboarding Handbook',
    categoryId: 'forms-paperwork',
    summary: 'Onboarding requirements and official paperwork guidance.',
    visibility: 'candidate',
  },
];

function serviceAccountFromJson(json) {
  const parsed = JSON.parse(json);
  if (typeof parsed.private_key === 'string') parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  if (typeof parsed.privateKey === 'string') parsed.privateKey = parsed.privateKey.replace(/\\n/g, '\n');
  return parsed;
}

function initAdmin() {
  if (getApps().length) return;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    initializeApp({ credential: cert(serviceAccountFromJson(serviceAccountJson)), projectId });
    return;
  }

  if (existsSync(LOCAL_SERVICE_ACCOUNT)) {
    initializeApp({
      credential: cert(serviceAccountFromJson(readFileSync(LOCAL_SERVICE_ACCOUNT, 'utf8'))),
      projectId,
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function unescapeMarkdown(value) {
  return value.replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');
}

function stripInlineMarkdown(value) {
  return unescapeMarkdown(value)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .trim();
}

function titleFromKey(key) {
  return key
    .replace(/^part_\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function block(type, data) {
  blockCounter += 1;
  const hash = createHash('sha1')
    .update(`${blockCounter}:${type}:${JSON.stringify(data)}`)
    .digest('hex')
    .slice(0, 10);
  return { id: hash, type, data };
}

function stringifyForSearch(value) {
  if (typeof value === 'string') return stripInlineMarkdown(value);
  if (Array.isArray(value)) return value.map(stringifyForSearch).join(' ');
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, child]) => `${titleFromKey(key)} ${stringifyForSearch(child)}`)
      .join(' ');
  }
  return '';
}

function valueToBlocks(key, value, level = 2) {
  const blocks = [];
  const label = titleFromKey(key);

  if (typeof value === 'string') {
    blocks.push(block('header', { text: label, level: Math.min(level, 4) }));
    blocks.push(block('paragraph', { text: stripInlineMarkdown(value) }));
    return blocks;
  }

  if (Array.isArray(value)) {
    blocks.push(block('header', { text: label, level: Math.min(level, 4) }));
    blocks.push(block('list', { style: 'unordered', items: value.map((item) => stringifyForSearch(item)) }));
    return blocks;
  }

  if (value && typeof value === 'object') {
    blocks.push(block('header', { text: label, level: Math.min(level, 4) }));
    for (const [childKey, childValue] of Object.entries(value)) {
      blocks.push(...valueToBlocks(childKey, childValue, level + 1));
    }
  }

  return blocks;
}

function articleFromSection(section, handbook) {
  blockCounter = 0;
  const source = handbook[section.key];
  const bodyEditorJs = {
    time: Date.now(),
    version: '2.31.6',
    blocks: valueToBlocks(section.key, source),
  };
  const plainTextSearch = [section.title, section.summary, stringifyForSearch(source)].join('\n');
  const slug = slugify(section.title);

  return {
    id: `handbook-${slug}`,
    type: 'wiki',
    title: section.title,
    slug,
    summary: section.summary,
    bodyEditorJs,
    plainTextSearch,
    categoryId: section.categoryId,
    tagIds: ['handbook'],
    linkedContentIds: [],
    unresolvedWikiLinks: [],
    backlinks: [],
    visibility: section.visibility,
    status: 'published',
    deliveryMode: 'wiki_page',
    ownerUid: 'system',
    ownerRole: 'Camp Lawton Staff Handbook',
    createdByUid: 'system',
    updatedByUid: 'system',
    reviewedByUid: null,
    publishedByUid: 'system',
    archivedAt: null,
    emergencyPriority: section.categoryId === 'emergency-procedures' ? 1 : 0,
    isPinned: section.key === 'part_2_policies_procedures_guidelines_and_laws',
    versionNumber: 1,
    sourceFile: 'Camp_Lawton_Staff_Handbook.json',
  };
}

function titleFromSongFile(filename, markdown) {
  const firstNonEmpty = markdown.split(/\r?\n/).find((line) => line.trim());
  const titleMatch = firstNonEmpty?.trim().match(/^\*\*(.+?)\*\*\s*$/);
  if (titleMatch) return stripInlineMarkdown(titleMatch[1]);
  return filename.replace(/\.md$/i, '').replace(/_/g, "'");
}

function songMarkdownToBlocks(markdown, title) {
  blockCounter = 0;
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const firstTitleIndex = lines.findIndex((line) => stripInlineMarkdown(line) === title);
  const bodyLines = firstTitleIndex >= 0 ? lines.slice(firstTitleIndex + 1) : lines;
  const paragraphs = [];
  let current = [];

  for (const line of bodyLines) {
    if (!line.trim()) {
      if (current.length) {
        paragraphs.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }

  if (current.length) paragraphs.push(current);

  return paragraphs.flatMap((paragraph) => {
    const cleanedLines = paragraph.map(stripInlineMarkdown).filter(Boolean);
    if (!cleanedLines.length) return [];

    const oneLine = cleanedLines.length === 1 ? cleanedLines[0] : null;
    const lower = oneLine?.toLowerCase() ?? '';
    if (
      oneLine
      && (
        lower === 'chorus'
        || lower.startsWith('chorus ')
        || lower === 'refrain'
        || lower.startsWith('refrain ')
        || lower.startsWith('verse')
      )
    ) {
      return [block('header', { text: oneLine, level: 3 })];
    }

    return [block('paragraph', { text: cleanedLines.join('\n') })];
  });
}

function articlesFromSongs() {
  if (!existsSync(SONGS_DIR)) return [];

  return readdirSync(SONGS_DIR)
    .filter((filename) => filename.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b))
    .map((filename) => {
      const sourceFile = `songs/${filename}`;
      const markdown = readFileSync(path.join(SONGS_DIR, filename), 'utf8');
      const title = titleFromSongFile(filename, markdown);
      const slug = slugify(title);
      const bodyEditorJs = {
        time: Date.now(),
        version: '2.31.6',
        blocks: songMarkdownToBlocks(markdown, title),
      };
      const plainTextSearch = [title, stripInlineMarkdown(markdown)].join('\n');

      return {
        id: `songbook-${slug}`,
        type: 'wiki',
        title,
        slug,
        summary: `Songbook entry for ${title}.`,
        bodyEditorJs,
        plainTextSearch,
        categoryId: 'songbook',
        tagIds: ['songbook', 'song'],
        linkedContentIds: [],
        unresolvedWikiLinks: [],
        backlinks: [],
        visibility: 'staff',
        status: 'published',
        deliveryMode: 'wiki_page',
        ownerUid: 'system',
        ownerRole: 'Camp Lawton Songbook',
        createdByUid: 'system',
        updatedByUid: 'system',
        reviewedByUid: null,
        publishedByUid: 'system',
        archivedAt: null,
        emergencyPriority: 0,
        isPinned: false,
        versionNumber: 1,
        sourceFile,
      };
    });
}

async function main() {
  if (!existsSync(HANDBOOK_PATH)) {
    throw new Error(`Missing ${HANDBOOK_PATH}`);
  }

  const handbook = JSON.parse(readFileSync(HANDBOOK_PATH, 'utf8'));
  const handbookArticles = sectionMap.map((section) => articleFromSection(section, handbook));
  const songArticles = articlesFromSongs();
  const articles = [...handbookArticles, ...songArticles];

  console.log(`${writeMode ? 'Writing' : 'Dry run for'} ${articles.length} wiki articles:`);
  console.log(`- ${handbookArticles.length} handbook articles`);
  console.log(`- ${songArticles.length} songbook articles`);
  for (const article of articles) {
    console.log(`- ${article.id}: ${article.title} (${article.categoryId}, ${article.visibility})`);
  }

  if (!writeMode) {
    console.log('\nDry run only. Run `npm run seed:handbook -- --write` to write these to Firestore.');
    return;
  }

  initAdmin();
  const db = getFirestore();
  const batch = db.batch();

  for (const article of articles) {
    const ref = db.collection('contentItems').doc(article.id);
    batch.set(ref, {
      ...article,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      publishedAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewDueAt: null,
    }, { merge: true });

    batch.set(ref.collection('revisions').doc('v1'), {
      id: 'v1',
      versionNumber: 1,
      status: 'published',
      bodyEditorJs: article.bodyEditorJs,
      plainTextSearch: article.plainTextSearch,
      changeSummary: `Seeded from ${article.sourceFile}`,
      createdByUid: 'system',
      reviewedByUid: null,
      approvedByUid: 'system',
      publishedByUid: 'system',
      createdAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      publishedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  console.log('\nSeed complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
