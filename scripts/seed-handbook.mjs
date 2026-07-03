import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const HANDBOOK_PATH = path.join(process.cwd(), 'Camp_Lawton_Staff_Handbook.json');
const SONGS_DIR = path.join(process.cwd(), 'songs');
const LOCAL_SERVICE_ACCOUNT = path.join(process.cwd(), 'camp-lawton-staff-hub-firebase-adminsdk-fbsvc-439f443121.json');
const writeMode = process.argv.includes('--write');
const publicMode = process.argv.includes('--public');
const HANDBOOK_SOURCE_FILE = 'Camp_Lawton_Staff_Handbook.json';
const EDITOR_VERSION = '2.31.6';

const LEGACY_PARENT_ARTICLE_IDS = [
  'handbook-camp-staff-training-and-culture',
  'handbook-policies-procedures-guidelines-and-laws',
  'handbook-campfire-master-class-and-songbook',
  'handbook-staff-onboarding-handbook',
];

let blockCounter = 0;

const TITLE_OVERRIDES = {
  aims_of_scouting: 'The Aims of Scouting',
  methods_of_scouting: 'The Methods of Scouting',
  ncs_certification_roles: 'NCS Certification Roles',
  this_is_your_life_schedule: 'This Is Your Life Schedule',
  severe_weather_preparedness: 'Severe Weather Preparedness',
  safeguarding_youth: 'Safeguarding Youth',
  the_camp_lawton_guidelines: 'The Camp Lawton Guidelines',
  health_and_safety: 'Health and Safety',
  legal_policies: 'Legal Policies',
  camp_opening_procedures: 'Camp Opening Procedures',
  how_to_write_funny: 'How to Write Funny',
  writing_songs: 'Writing Songs',
  songbook: 'Songbook Index',
  necessary_paperwork: 'Necessary Paperwork',
  packing_list: 'Packing List',
  code_of_conduct: 'Code of Conduct',
};

const standaloneSections = [
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
];

const handbookPartSections = [
  {
    key: 'part_1_camp_staff_training_and_culture',
    title: 'Camp Staff Culture and Training',
    categoryId: 'camp-staff-culture-training',
    summary: 'Mission, culture, chain of command, staff duties, and training expectations.',
    visibility: 'staff',
    tagIds: ['handbook', 'training', 'camp-staff-culture-training'],
    pages: [
      { title: 'Our Mission & Vision', keys: ['mission_and_vision'] },
      { title: 'The Core Pillars of Summer Camp', keys: ['core_pillars_of_summer_camp'] },
      { title: 'The Aims and Methods of Scouting', keys: ['aims_of_scouting', 'methods_of_scouting'] },
      { title: 'WHAT MAKES A STAFF?', keys: ['what_makes_a_staff'] },
      {
        title: 'The Chain of Command',
        keys: ['chain_of_command', 'age_requirements_for_staff_leadership', 'ncs_certification_roles'],
      },
      { title: 'Staff Expectations', keys: ['duties', 'the_rules'] },
      { title: 'Stress Management and Mental Stability', keys: ['stress_management'] },
      { title: 'Glossary', keys: ['glossary'] },
      { title: 'This Is Your Life', keys: ['this_is_your_life_schedule'] },
      { title: 'Customer Service', keys: ['customer_service'] },
      { title: 'How To Do Your Job', keys: ['program_areas', 'teaching_methods'] },
      { title: 'BSA Ceremonies and Campfire Guidance', keys: ['campfires_and_ceremonies'] },
    ],
  },
  {
    key: 'part_2_policies_procedures_guidelines_and_laws',
    title: 'Policies, Procedures, Guidelines, and Laws',
    categoryId: 'policies-procedures',
    summary: 'Operational policies and staff conduct guidance from the handbook.',
    visibility: 'staff',
    tagIds: ['handbook', 'policies-procedures'],
    pages: [
      { title: 'Severe Weather Preparedness', keys: ['severe_weather_preparedness'] },
      { title: 'Safeguarding Youth', keys: ['safeguarding_youth'] },
      { title: 'Policies and Procedures', keys: ['the_camp_lawton_guidelines'] },
      { title: 'HEALTH AND SAFETY', keys: ['health_and_safety'] },
      { title: 'LEGAL POLICIES AND INFORMATION', keys: ['legal_policies'] },
      { title: 'CAMP OPENING PROCEDURES', keys: ['camp_opening_procedures'] },
    ],
  },
  {
    key: 'part_3_campfire_master_class_and_songbook',
    title: 'Campfire Master Class and Songbook',
    categoryId: 'songbook',
    summary: 'Campfire program guidance, songs, and camp culture material.',
    visibility: 'staff',
    tagIds: ['handbook', 'campfire', 'songbook'],
    pages: [
      { title: 'How To Write Funny', keys: ['how_to_write_funny'] },
      { title: 'Writing Songs', keys: ['writing_songs'] },
      { title: 'Songbook', keys: ['songbook'] },
    ],
  },
  {
    key: 'part_4_onboarding',
    title: 'Staff Onboarding Handbook',
    categoryId: 'forms-paperwork',
    summary: 'Onboarding requirements and official paperwork guidance.',
    visibility: 'candidate',
    tagIds: ['handbook', 'onboarding'],
    pages: [
      { title: 'Required Paperwork', keys: ['necessary_paperwork'] },
      { title: 'Packing List', keys: ['packing_list'] },
      { title: 'CAMP LAWTON SUMMER CAMP STAFF COMMITMENT & CODE OF CONDUCT', keys: ['code_of_conduct'] },
    ],
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
  if (TITLE_OVERRIDES[key]) return TITLE_OVERRIDES[key];
  return key
    .replace(/^part_\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bNcs\b/g, 'NCS')
    .replace(/\bCit\b/g, 'CIT')
    .replace(/\bEap\b/g, 'EAP');
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

function entryToBlocks(key, value) {
  if (typeof value === 'string') {
    return [block('paragraph', { text: stripInlineMarkdown(value) })];
  }

  if (Array.isArray(value)) {
    return [block('list', { style: 'unordered', items: value.map((item) => stringifyForSearch(item)) })];
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, childValue]) => valueToBlocks(childKey, childValue));
  }

  return [];
}

function pageSourceEntries(page, source) {
  const keys = page.keys ?? (page.key ? [page.key] : []);
  return keys
    .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
    .map((key) => [key, source[key]]);
}

function blocksFromPage(page, source) {
  const entries = pageSourceEntries(page, source);
  if (entries.length === 1) {
    const [key, value] = entries[0];
    return entryToBlocks(key, value);
  }

  return entries.flatMap(([key, value]) => valueToBlocks(key, value));
}

function summaryFromSource(title, categoryTitle, sourceText) {
  const compact = sourceText.replace(/\s+/g, ' ').trim();
  if (!compact) return `${title} from ${categoryTitle}.`;

  const prefix = `${categoryTitle}: `;
  const maxLength = 180 - prefix.length;
  const excerpt = compact.length > maxLength ? `${compact.slice(0, maxLength).trimEnd()}...` : compact;
  return `${prefix}${excerpt}`;
}

function handbookArticleFromPage(page, part, source) {
  blockCounter = 0;
  const pageTitle = page.title ?? titleFromKey(page.key);
  const entries = pageSourceEntries(page, source);
  const sourceText = entries.map(([, value]) => stringifyForSearch(value)).join('\n');
  const categorySlug = slugify(part.title);
  const pageSlug = slugify(pageTitle);
  const bodyEditorJs = {
    time: Date.now(),
    version: EDITOR_VERSION,
    blocks: blocksFromPage(page, source),
  };
  const slug = page.standalone ? pageSlug : `${categorySlug}-${pageSlug}`;
  const summary = page.summary ?? summaryFromSource(pageTitle, part.title, sourceText);
  const plainTextSearch = [pageTitle, part.title, summary, sourceText].join('\n');

  return {
    id: page.standalone ? `handbook-${pageSlug}` : `handbook-${part.categoryId}-${pageSlug}`,
    type: 'wiki',
    title: pageTitle,
    slug,
    summary,
    bodyEditorJs,
    plainTextSearch,
    categoryId: part.categoryId,
    tagIds: page.tagIds ?? part.tagIds ?? ['handbook'],
    linkedContentIds: [],
    unresolvedWikiLinks: [],
    backlinks: [],
    visibility: publicMode ? 'public' : part.visibility,
    status: 'published',
    deliveryMode: 'wiki_page',
    ownerUid: 'system',
    ownerRole: 'Camp Lawton Staff Handbook',
    createdByUid: 'system',
    updatedByUid: 'system',
    reviewedByUid: null,
    publishedByUid: 'system',
    archivedAt: null,
    emergencyPriority: page.emergencyPriority ?? 0,
    isPinned: page.isPinned ?? false,
    versionNumber: 1,
    sourceFile: `${HANDBOOK_SOURCE_FILE}#${part.key}.${entries.map(([key]) => key).join('+')}`,
  };
}

function pagesForPart(part, source) {
  if (part.pages) return part.pages;
  return Object.keys(source).map((key) => ({ key }));
}

function articlesFromHandbook(handbook) {
  const standaloneArticles = standaloneSections.map((section) =>
    handbookArticleFromPage(
      {
        key: section.key,
        title: section.title,
        summary: section.summary,
        tagIds: ['handbook'],
        standalone: true,
      },
      {
        key: section.key,
        title: section.title,
        categoryId: section.categoryId,
        visibility: section.visibility,
        tagIds: ['handbook'],
      },
      { [section.key]: handbook[section.key] },
    ),
  );

  const partArticles = handbookPartSections.flatMap((part) => {
    const source = handbook[part.key] ?? {};
    return pagesForPart(part, source).map((page) => handbookArticleFromPage(page, part, source));
  });

  return [...standaloneArticles, ...partArticles];
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
        version: EDITOR_VERSION,
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
        visibility: publicMode ? 'public' : 'staff',
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
  const handbookArticles = articlesFromHandbook(handbook);
  const songArticles = articlesFromSongs();
  const articles = [...handbookArticles, ...songArticles];

  console.log(`${writeMode ? 'Writing' : 'Dry run for'} ${articles.length} wiki articles:`);
  console.log(`- ${handbookArticles.length} handbook section articles`);
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
  let legacyArchivedCount = 0;

  for (const id of LEGACY_PARENT_ARTICLE_IDS) {
    const legacyRef = db.collection('contentItems').doc(id);
    const legacySnapshot = await legacyRef.get();
    if (!legacySnapshot.exists) continue;

    legacyArchivedCount += 1;
    batch.set(legacyRef, {
      status: 'archived',
      visibility: 'admin_only',
      archivedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: 'system',
    }, { merge: true });
  }

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
  if (legacyArchivedCount) console.log(`Archived ${legacyArchivedCount} legacy parent handbook articles.`);
  console.log('\nSeed complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
