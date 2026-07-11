import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const DEFAULT_SOURCE_PATH = path.join(process.cwd(), 'camp_lawton_staff_handbook_wiki_pages_final.json');
const LOCAL_SERVICE_ACCOUNT = path.join(process.cwd(), 'camp-lawton-staff-hub-firebase-adminsdk-fbsvc-439f443121.json');
const EDITOR_VERSION = '2.31.6';
const writeMode = process.argv.includes('--write');
const publicMode = process.argv.includes('--public');
const archiveExistingHandbook = process.argv.includes('--archive-existing-handbook');
const sourceArg = process.argv.find((arg) => arg.endsWith('.json'));
const sourcePath = path.resolve(sourceArg ?? DEFAULT_SOURCE_PATH);

let blockCounter = 0;

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
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function block(type, data) {
  blockCounter += 1;
  const hash = createHash('sha1')
    .update(`${blockCounter}:${type}:${JSON.stringify(data)}`)
    .digest('hex')
    .slice(0, 10);
  return { id: hash, type, data };
}

function normalizeInline(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

function stripMarkdown(markdown) {
  return String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .split(/\r?\n/)
    .map(normalizeInline)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summaryFromMarkdown(title, markdown) {
  const firstParagraph = String(markdown ?? '')
    .split(/\n{2,}/)
    .map(stripMarkdown)
    .find(Boolean);
  const source = firstParagraph || title;
  return source.length > 180 ? `${source.slice(0, 177).trimEnd()}...` : source;
}

function visibilityFromPage(value) {
  switch (String(value ?? '').toLowerCase()) {
    case 'public':
      return 'public';
    case 'candidate':
      return 'candidate';
    case 'onboarding':
      return 'onboarding';
    case 'alumni':
      return 'alumni';
    case 'admin':
    case 'admin-only':
    case 'admin_only':
      return 'admin_only';
    case 'safety-sensitive':
    case 'safety_sensitive':
      return 'safety_sensitive';
    case 'adult-staff':
    case 'area-director':
    case 'staff':
    default:
      return 'staff';
  }
}

function categoryFromSection(section) {
  switch (String(section ?? '').toLowerCase()) {
    case 'training':
      return 'camp-staff-culture-training';
    case 'policies and procedures':
      return 'policies-procedures';
    case 'emergency procedures':
      return 'emergency-procedures';
    case 'onboarding':
      return 'forms-paperwork';
    case 'admin':
      return 'resources';
    case 'camp culture and history':
    default:
      return 'camp-culture-history';
  }
}

function pageStatusToContentStatus(status) {
  return String(status ?? '').toLowerCase() === 'archived' ? 'archived' : 'published';
}

function parseTable(lines, startIndex) {
  const rows = [];
  let index = startIndex;

  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
    const cells = lines[index]
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => normalizeInline(cell.trim()));

    const isSeparator = cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    if (!isSeparator) rows.push(cells);
    index += 1;
  }

  return { rows, nextIndex: index };
}

function flushParagraph(blocks, paragraphLines) {
  if (!paragraphLines.length) return;
  const text = paragraphLines.join('\n').trim();
  if (text) blocks.push(block('paragraph', { text }));
  paragraphLines.length = 0;
}

function markdownToBlocks(markdown) {
  blockCounter = 0;
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  const paragraphLines = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(blocks, paragraphLines);
      index += 1;
      continue;
    }

    const fenceMatch = trimmed.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      flushParagraph(blocks, paragraphLines);
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(block('code', { code: codeLines.join('\n') }));
      continue;
    }

    if (/^\s*---+\s*$/.test(trimmed)) {
      flushParagraph(blocks, paragraphLines);
      blocks.push(block('delimiter', {}));
      index += 1;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?/.test(lines[index + 1])) {
      flushParagraph(blocks, paragraphLines);
      const table = parseTable(lines, index);
      if (table.rows.length) blocks.push(block('table', { withHeadings: true, content: table.rows.map(row => ({ values: row })) }));
      index = table.nextIndex;
      continue;
    }

    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flushParagraph(blocks, paragraphLines);
      blocks.push(block('header', { text: normalizeInline(headerMatch[2]), level: Math.min(headerMatch[1].length + 1, 4) }));
      index += 1;
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.+)$/);
    if (quoteMatch) {
      flushParagraph(blocks, paragraphLines);
      const quoteLines = [normalizeInline(quoteMatch[1])];
      index += 1;
      while (index < lines.length) {
        const nextQuote = lines[index].trim().match(/^>\s?(.+)$/);
        if (!nextQuote) break;
        quoteLines.push(normalizeInline(nextQuote[1]));
        index += 1;
      }
      blocks.push(block('quote', { text: quoteLines.join('\n'), caption: '' }));
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph(blocks, paragraphLines);
      const style = orderedMatch ? 'ordered' : 'unordered';
      const items = [];

      while (index < lines.length) {
        const current = lines[index].trim();
        const currentUnordered = current.match(/^[-*+]\s+(.+)$/);
        const currentOrdered = current.match(/^\d+\.\s+(.+)$/);
        if (style === 'unordered' && !currentUnordered) break;
        if (style === 'ordered' && !currentOrdered) break;
        items.push(normalizeInline((currentUnordered ?? currentOrdered)[1]));
        index += 1;
      }

      blocks.push(block('list', { style, items }));
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }

  flushParagraph(blocks, paragraphLines);
  return blocks;
}

function flatArticleFromPage(page, sourceFile) {
  blockCounter = 0;
  const slug = slugify(page.id || page.title);
  const markdown = String(page.content_markdown ?? '').trim();
  const summary = String(page.summary ?? '').trim() || summaryFromMarkdown(page.title, markdown);
  const sectionSlug = slugify(page.section);
  const sourceStatus = String(page.status ?? 'draft-needs-review');
  const tagIds = [...new Set(['handbook', sectionSlug, ...(Array.isArray(page.tags) ? page.tags.map(slugify) : [])].filter(Boolean))];
  const plainTextSearch = [page.title, page.section, summary, stripMarkdown(markdown), tagIds.join(' ')].filter(Boolean).join('\n');
  const bodyEditorJs = {
    time: Date.now(),
    version: EDITOR_VERSION,
    blocks: markdownToBlocks(markdown),
  };

  return {
    id: `handbook-${slug}`,
    type: 'wiki',
    title: page.title,
    slug,
    summary,
    bodyEditorJs,
    bodyMarkdown: markdown,
    plainTextSearch,
    categoryId: categoryFromSection(page.section),
    tagIds,
    linkedContentIds: [],
    unresolvedWikiLinks: [],
    backlinks: [],
    visibility: publicMode ? 'public' : visibilityFromPage(page.visibility),
    status: pageStatusToContentStatus(page.status),
    sourceStatus,
    deliveryMode: 'wiki_page',
    ownerUid: 'system',
    ownerRole: 'Camp Lawton Staff Handbook',
    createdByUid: 'system',
    updatedByUid: 'system',
    reviewedByUid: null,
    publishedByUid: 'system',
    archivedAt: null,
    emergencyPriority: page.section === 'Emergency Procedures' ? 10 : 0,
    isPinned: Boolean(page.show_on_home),
    versionNumber: 1,
    sourceFile: `${sourceFile}#${page.id}`,
  };
}

function articlesFromFlatSource(source, sourceFile) {
  if (!Array.isArray(source.pages)) {
    throw new Error('Flat wiki source must include a pages array.');
  }
  return source.pages.map((page) => flatArticleFromPage(page, sourceFile));
}

async function commitBatch(db, writes) {
  let batch = db.batch();
  let count = 0;

  for (const write of writes) {
    write(batch);
    count += 1;
    if (count >= 450) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) await batch.commit();
}

async function archiveExistingHandbookArticles(db, importedIds) {
  const snapshot = await db.collection('contentItems').where('tagIds', 'array-contains', 'handbook').get();
  const writes = [];
  let archived = 0;

  snapshot.docs.forEach((doc) => {
    if (importedIds.has(doc.id)) return;
    archived += 1;
    writes.push((batch) => batch.set(doc.ref, {
      status: 'archived',
      visibility: 'admin_only',
      archivedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: 'system',
    }, { merge: true }));
  });

  await commitBatch(db, writes);
  return archived;
}

async function main() {
  if (!existsSync(sourcePath)) throw new Error(`Missing wiki source JSON: ${sourcePath}`);

  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const sourceFile = path.basename(sourcePath);
  const articles = articlesFromFlatSource(source, sourceFile);

  console.log(`${writeMode ? 'Writing' : 'Dry run for'} ${articles.length} full wiki articles from ${sourceFile}:`);
  articles.forEach((article) => {
    console.log(`- ${article.id}: ${article.title} (${article.categoryId}, ${article.visibility}, ${article.bodyEditorJs.blocks.length} blocks)`);
  });

  if (!writeMode) {
    console.log('\nDry run only. Add --write to write these full articles to Firestore.');
    console.log('Use --archive-existing-handbook to archive old summarized handbook articles during import.');
    return;
  }

  initAdmin();
  const db = getFirestore();
  const importedIds = new Set(articles.map((article) => article.id));

  if (archiveExistingHandbook) {
    const archived = await archiveExistingHandbookArticles(db, importedIds);
    if (archived) console.log(`Archived ${archived} existing handbook articles not present in the flat import.`);
  }

  const writes = [];
  for (const article of articles) {
    const ref = db.collection('contentItems').doc(article.id);
    writes.push((batch) => {
      batch.set(ref, {
        ...article,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        publishedAt: FieldValue.serverTimestamp(),
        reviewedAt: null,
        reviewDueAt: null,
      }, { merge: true });
    });
    writes.push((batch) => {
      batch.set(ref.collection('revisions').doc('v1'), {
        id: 'v1',
        versionNumber: 1,
        status: article.status === 'published' ? 'published' : 'draft',
        bodyEditorJs: article.bodyEditorJs,
        bodyMarkdown: article.bodyMarkdown,
        plainTextSearch: article.plainTextSearch,
        changeSummary: `Seeded full article from ${article.sourceFile}`,
        createdByUid: 'system',
        reviewedByUid: null,
        approvedByUid: article.status === 'published' ? 'system' : null,
        publishedByUid: article.status === 'published' ? 'system' : null,
        createdAt: FieldValue.serverTimestamp(),
        reviewedAt: null,
        publishedAt: article.status === 'published' ? FieldValue.serverTimestamp() : null,
      }, { merge: true });
    });
  }

  await commitBatch(db, writes);
  console.log('\nFull wiki import complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
