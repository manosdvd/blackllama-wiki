import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const SOURCE_PATH = path.join(process.cwd(), 'staffHandbookWiki.md');
const SOURCE_FILE = 'staffHandbookWiki.md';
const LOCAL_SERVICE_ACCOUNT = path.join(process.cwd(), 'camp-lawton-staff-hub-firebase-adminsdk-fbsvc-439f443121.json');
const EDITOR_VERSION = '2.31.6';
const EDITOR_TIME = 0;
const EXPECTED_ARTICLE_COUNT = 68;
const MAX_BATCH_WRITES = 400;

const CATEGORY_DEFINITIONS = [
  {
    title: 'Camp Culture and Training',
    id: 'camp-culture-and-training',
    expectedArticles: 28,
  },
  {
    title: 'Policies',
    id: 'policies',
    expectedArticles: 22,
  },
  {
    title: 'Procedures',
    id: 'procedures',
    expectedArticles: 15,
  },
  {
    title: 'Onboarding',
    id: 'onboarding',
    expectedArticles: 3,
  },
];

const CATEGORY_BY_TITLE = new Map(CATEGORY_DEFINITIONS.map((category) => [category.title, category]));
const ARTICLE_ALIASES = new Map([
  ['aims and methods of scouting', 'The Aims and Methods of Scouting'],
  ['code of conduct', 'Camp Lawton Staff Code of Conduct'],
  ['comedy master class', 'Campfire Master Class And Songbook'],
  ['the art of arbitrary absurdity', 'Campfire Master Class And Songbook'],
]);
const SONGBOOK_REFERENCE = 'songbook';
const RADIO_PLACEHOLDERS = new Set([
  'you',
  'area you’re calling',
  "area you're calling",
  'your area',
]);

const STOP_WORD_TAGS = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with',
]);

const SUMMARY_OVERRIDES = new Map([
  [
    'Catalina Council/Camp Lawton Leadership',
    'Camp and council leadership roles, names, and contact information for Camp Lawton staff.',
  ],
  [
    'Packing List',
    'What staff should pack for camp, including required clothing and gear, optional comforts, and prohibited items.',
  ],
]);

// Load AI summaries if available
const AI_SUMMARIES_PATH = path.join(process.cwd(), 'scripts/ai_summaries.json');
if (existsSync(AI_SUMMARIES_PATH)) {
  try {
    const aiSummaries = JSON.parse(readFileSync(AI_SUMMARIES_PATH, 'utf8'));
    for (const [title, summary] of Object.entries(aiSummaries)) {
      SUMMARY_OVERRIDES.set(title, summary);
    }
    console.log(`Loaded ${Object.keys(aiSummaries).length} AI-generated summaries from scripts/ai_summaries.json`);
  } catch (err) {
    console.warn('Warning: Could not parse scripts/ai_summaries.json:', err.message);
  }
}

function hash(value, length = 64) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function normalizeReference(value) {
  return value
    .trim()
    .replace(/\\([^\w\s])/g, '$1')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function unescapeMarkdown(value) {
  return value.replace(/\\([^\w\s])/g, '$1');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(value) {
  const href = unescapeMarkdown(String(value).trim()).replace(/^<|>$/g, '');
  if (/^(?:https?:|mailto:)/i.test(href) || href.startsWith('/')) return href;
  return '#';
}

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

  initializeApp({ credential: applicationDefault(), projectId });
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

export function parseHandbook(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const categoryMarkers = [];
  const articles = [];
  let currentCategory = null;
  let currentArticle = null;

  const finishArticle = (endLine) => {
    if (!currentArticle) return;
    const bodyLines = trimBlankLines(currentArticle.bodyLines);
    articles.push({
      ...currentArticle,
      bodyLines,
      bodyMarkdown: bodyLines.join('\n'),
      contentStartLine: currentArticle.headingLine + 1,
      contentEndLine: Math.max(currentArticle.headingLine, endLine),
    });
    currentArticle = null;
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const h1Match = line.match(/^#[ \t]+(.*)$/);

    if (!h1Match) {
      if (currentArticle) currentArticle.bodyLines.push(line);
      else if (line.trim()) {
        throw new Error(`Content appears outside an article at ${SOURCE_FILE}:${lineNumber}.`);
      }
      return;
    }

    const title = h1Match[1].trim();
    if (!title) {
      // Empty Markdown headings in the source are formatting artifacts, not articles.
      if (currentArticle) currentArticle.bodyLines.push('');
      return;
    }

    const category = CATEGORY_BY_TITLE.get(title);
    if (category) {
      finishArticle(lineNumber - 1);
      currentCategory = category;
      categoryMarkers.push({ ...category, line: lineNumber });
      return;
    }

    finishArticle(lineNumber - 1);
    if (!currentCategory) {
      throw new Error(`Article “${title}” appears before the first category at ${SOURCE_FILE}:${lineNumber}.`);
    }

    currentArticle = {
      title,
      category: currentCategory,
      headingLine: lineNumber,
      bodyLines: [],
    };
  });

  finishArticle(lines.length);

  const markerTitles = categoryMarkers.map((marker) => marker.title);
  const expectedTitles = CATEGORY_DEFINITIONS.map((category) => category.title);
  if (JSON.stringify(markerTitles) !== JSON.stringify(expectedTitles)) {
    throw new Error(
      `Expected exactly these category markers in order: ${expectedTitles.join(', ')}; found: ${markerTitles.join(', ') || 'none'}.`,
    );
  }

  if (articles.length !== EXPECTED_ARTICLE_COUNT) {
    throw new Error(`Expected ${EXPECTED_ARTICLE_COUNT} nonblank article H1 headings; found ${articles.length}.`);
  }

  const duplicateTitles = articles
    .map((article) => article.title)
    .filter((title, index, titles) => titles.indexOf(title) !== index);
  if (duplicateTitles.length) throw new Error(`Duplicate article titles: ${[...new Set(duplicateTitles)].join(', ')}.`);

  const emptyArticles = articles.filter((article) => !article.bodyMarkdown.trim());
  if (emptyArticles.length) throw new Error(`Articles without content: ${emptyArticles.map((article) => article.title).join(', ')}.`);

  return { articles, categoryMarkers, sourceLineCount: lines.length };
}

function buildReferenceResolver(parsedArticles) {
  const titleLookup = new Map();
  parsedArticles.forEach((article) => titleLookup.set(normalizeReference(article.title), article));

  return (displayLabel) => {
    const normalized = normalizeReference(displayLabel);
    if (normalized === SONGBOOK_REFERENCE) {
      return { kind: 'category', categoryId: 'songbook', href: '/wiki?category=songbook' };
    }
    if (RADIO_PLACEHOLDERS.has(normalized)) return { kind: 'placeholder' };

    const targetTitle = ARTICLE_ALIASES.get(normalized);
    const target = targetTitle
      ? titleLookup.get(normalizeReference(targetTitle))
      : titleLookup.get(normalized);
    if (!target) return { kind: 'unresolved' };

    const targetSlug = slugify(target.title);
    return {
      kind: 'article',
      id: `handbook-${targetSlug}`,
      title: target.title,
      href: `/wiki/article/handbook-${targetSlug}`,
    };
  };
}

function renderEmphasis(value) {
  let html = value;
  // Handles the source's “***bold lead** italic continuation*” construction.
  html = html.replace(/\*\*\*([^*\n]+?)\*\*([^*\n]+?)\*/g, '<em><strong>$1</strong>$2</em>');
  html = html.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/___([^_\n]+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<![\w_])_([^_\n]+?)_(?![\w_])/g, '<em>$1</em>');
  html = html.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');
  return html;
}

function inlineToHtml(value, resolveReference) {
  const tokens = [];
  const token = (html) => {
    const placeholder = `\uE000${tokens.length}\uE001`;
    tokens.push(html);
    return placeholder;
  };

  let text = String(value).trim().replace(/[ \t]{2,}$/, '');

  text = text.replace(/`([^`\n]+)`/g, (_match, code) => token(`<code>${escapeHtml(unescapeMarkdown(code))}</code>`));

  text = text.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (_match, alt, url) => {
    return token(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0; display: block;" />`);
  });

  text = text.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_match, label, rawHref) => {
    const href = safeHref(rawHref);
    const rel = /^https?:/i.test(href) ? ' rel="noopener noreferrer"' : '';
    const labelHtml = renderEmphasis(escapeHtml(unescapeMarkdown(label)));
    return token(`<a href="${escapeHtml(href)}" class="wiki-link"${rel}>${labelHtml}</a>`);
  });

  const replaceBracketReference = (match, label) => {
    const cleanLabel = unescapeMarkdown(label).trim();
    const resolution = resolveReference(cleanLabel);
    if (resolution.kind === 'article' || resolution.kind === 'category') {
      return token(`<a href="${escapeHtml(resolution.href)}" class="wiki-link">${escapeHtml(cleanLabel)}</a>`);
    }
    return token(escapeHtml(`[${cleanLabel}]`));
  };

  text = text.replace(/\\\[([^\]\n]+?)\\\]/g, replaceBracketReference);
  text = text.replace(/\[([^\]\n]+?)\]/g, replaceBracketReference);
  text = unescapeMarkdown(text);
  text = renderEmphasis(escapeHtml(text));

  return text.replace(/\uE000(\d+)\uE001/g, (_match, index) => tokens[Number(index)] ?? '');
}

function createBlock(type, data) {
  return { type, data };
}

function withDeterministicBlockIds(articleId, blocks) {
  return blocks.map((item, index) => ({
    id: hash(`${articleId}\0${index}\0${item.type}\0${JSON.stringify(item.data)}`, 12),
    ...item,
  }));
}

function listLine(line) {
  const match = line.match(/^([ \t]*)([-+*]|\d+[.)])[ \t]+(.+)$/);
  if (!match) return null;
  const indent = match[1].replace(/\t/g, '    ').length;
  return {
    indent,
    style: /^\d/.test(match[2]) ? 'ordered' : 'unordered',
    content: match[3],
  };
}

function nextNonblankIndex(lines, start) {
  let index = start;
  while (index < lines.length && !lines[index].trim()) index += 1;
  return index;
}

function parseList(lines, startIndex, resolveReference) {
  const first = listLine(lines[startIndex]);
  if (!first) return null;

  const roots = [];
  const stack = [];
  const baseIndent = first.indent;
  const rootStyle = first.style;
  let index = startIndex;
  let mostRecentItem = null;

  while (index < lines.length) {
    const rawLine = lines[index];
    if (!rawLine.trim()) {
      const lookahead = nextNonblankIndex(lines, index + 1);
      const nextListLine = lookahead < lines.length ? listLine(lines[lookahead]) : null;
      const nextIndent = lookahead < lines.length
        ? (lines[lookahead].match(/^([ \t]*)/)?.[1].replace(/\t/g, '    ').length ?? 0)
        : 0;
      if (nextListLine && nextListLine.indent >= baseIndent) {
        index = lookahead;
        continue;
      }
      if (mostRecentItem && lookahead < lines.length && nextIndent > baseIndent) {
        index = lookahead;
        continue;
      }
      break;
    }

    const parsed = listLine(rawLine);
    if (!parsed) {
      const indentation = rawLine.match(/^([ \t]*)/)?.[1].replace(/\t/g, '    ').length ?? 0;
      if (!mostRecentItem || indentation <= baseIndent) break;
      mostRecentItem.content += `<br>${inlineToHtml(rawLine.trim(), resolveReference)}`;
      index += 1;
      continue;
    }

    if (parsed.indent < baseIndent) break;
    if (parsed.indent === baseIndent && parsed.style !== rootStyle) break;

    while (stack.length && parsed.indent <= stack[stack.length - 1].indent) stack.pop();
    const item = {
      content: inlineToHtml(parsed.content, resolveReference),
      meta: { style: parsed.style },
      items: [],
    };
    if (stack.length) stack[stack.length - 1].item.items.push(item);
    else roots.push(item);
    stack.push({ indent: parsed.indent, item });
    mostRecentItem = item;
    index += 1;
  }

  return {
    nextIndex: index,
    block: createBlock('list', { style: rootStyle, meta: {}, items: roots }),
  };
}

function splitTableRow(line) {
  const source = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  let escaped = false;

  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      current += character;
      escaped = true;
    } else if (character === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function isTableSeparator(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isTableLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3;
}

export function markdownToBlocks(markdown, articleId, resolveReference) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      blocks.push(createBlock('image', {
        file: { url: imageMatch[2].trim() },
        caption: imageMatch[1].trim(),
      }));
      index += 1;
      continue;
    }

    if (/^#{2,6}[ \t]*$/.test(trimmed)) {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{2,6})[ \t]+(.+)$/);
    if (heading) {
      blocks.push(createBlock('header', {
        text: inlineToHtml(heading[2].trim(), resolveReference),
        level: Math.min(heading[1].length, 4),
      }));
      index += 1;
      continue;
    }

    if (/^(```|~~~)/.test(trimmed)) {
      const fence = trimmed.slice(0, 3);
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(createBlock('code', { code: code.join('\n') }));
      continue;
    }

    if (isTableLine(line)) {
      const rawRows = [];
      while (index < lines.length && isTableLine(lines[index])) {
        rawRows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const withHeadings = rawRows.length > 1 && isTableSeparator(rawRows[1]);
      const rows = withHeadings ? [rawRows[0], ...rawRows.slice(2)] : rawRows;
      blocks.push(createBlock('table', {
        withHeadings,
        // Firestore rejects arrays nested directly in arrays; row objects retain the table shape safely.
        content: rows.map((row) => ({ values: row.map((cell) => inlineToHtml(cell, resolveReference)) })),
      }));
      continue;
    }

    const parsedList = parseList(lines, index, resolveReference);
    if (parsedList) {
      blocks.push(parsedList.block);
      index = parsedList.nextIndex;
      continue;
    }

    if (/^>[ \t]?/.test(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && /^>[ \t]?/.test(lines[index].trim())) {
        quoteLines.push(inlineToHtml(lines[index].trim().replace(/^>[ \t]?/, ''), resolveReference));
        index += 1;
      }
      blocks.push(createBlock('quote', { text: quoteLines.join('<br>'), caption: '' }));
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(createBlock('delimiter', {}));
      index += 1;
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const candidate = lines[index];
      const candidateTrimmed = candidate.trim();
      if (!candidateTrimmed) break;
      if (paragraphLines.length && (
        /^(?:#{2,6})[ \t]+/.test(candidateTrimmed)
        || /^(```|~~~)/.test(candidateTrimmed)
        || isTableLine(candidate)
        || listLine(candidate)
        || /^>[ \t]?/.test(candidateTrimmed)
        || /^(?:-{3,}|\*{3,}|_{3,})$/.test(candidateTrimmed)
      )) break;
      paragraphLines.push(inlineToHtml(candidateTrimmed, resolveReference));
      index += 1;
    }
    blocks.push(createBlock('paragraph', { text: paragraphLines.join('<br>') }));
  }

  return withDeterministicBlockIds(articleId, blocks);
}

function markdownToPlainText(markdown) {
  return unescapeMarkdown(String(markdown))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/gm, '')
    .replace(/^>[ \t]?/gm, '')
    .replace(/^\|?[ :\-]+(?:\|[ :\-]+)+\|?$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function summaryFromMarkdown(title, markdown) {
  if (SUMMARY_OVERRIDES.has(title)) return SUMMARY_OVERRIDES.get(title);

  const paragraphs = markdownToPlainText(markdown)
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const narrativeParagraphs = paragraphs.filter((paragraph) => (
    !/^\(?placeholder\b/i.test(paragraph)
    && !/^[“”"‘’']/.test(paragraph)
    && !/^[-–—]\s/.test(paragraph)
  ));
  const candidate = narrativeParagraphs.find((paragraph) => paragraph.length >= 60)
    ?? narrativeParagraphs.find((paragraph) => paragraph.length >= 24)
    ?? paragraphs.find((paragraph) => paragraph.length >= 24)
    ?? paragraphs[0]
    ?? `${title} from the staff handbook.`;
  if (candidate.length <= 180) return candidate;
  const cutAt = candidate.lastIndexOf(' ', 176);
  return `${candidate.slice(0, cutAt > 80 ? cutAt : 176).trimEnd()}…`;
}

function articleTags(articleSlug, categoryId, title) {
  const topical = slugify(title)
    .split('-')
    .filter((part) => part.length > 2 && !STOP_WORD_TAGS.has(part))
    .slice(0, 3);
  return [...new Set(['handbook', 'staff-handbook', categoryId, articleSlug, ...topical])];
}

function escapedBracketReferences(markdown) {
  return [...String(markdown).matchAll(/\\\[([^\]\n]+?)\\\]/g)].map((match) => unescapeMarkdown(match[1]).trim());
}

function emergencyPriority(article) {
  if (article.category.id === 'procedures') return 10;
  if (['Severe Weather Preparedness', 'Safeguarding Youth'].includes(article.title)) return 10;
  return 0;
}

function createArticle(parsedArticle, resolveReference) {
  const slug = slugify(parsedArticle.title);
  const id = `handbook-${slug}`;
  const bodyPlainText = markdownToPlainText(parsedArticle.bodyMarkdown);
  const summary = summaryFromMarkdown(parsedArticle.title, parsedArticle.bodyMarkdown);
  const tagIds = articleTags(slug, parsedArticle.category.id, parsedArticle.title);
  const linkedContentIds = [];
  const unresolvedWikiLinks = [];

  for (const label of escapedBracketReferences(parsedArticle.bodyMarkdown)) {
    const resolution = resolveReference(label);
    if (resolution.kind === 'article' && !linkedContentIds.includes(resolution.id)) linkedContentIds.push(resolution.id);
    if (resolution.kind === 'unresolved' && !unresolvedWikiLinks.includes(label)) unresolvedWikiLinks.push(label);
  }

  const bodyEditorJs = {
    time: EDITOR_TIME,
    version: EDITOR_VERSION,
    blocks: markdownToBlocks(parsedArticle.bodyMarkdown, id, resolveReference),
  };
  const sourceHash = hash(parsedArticle.bodyMarkdown);

  return {
    id,
    type: 'wiki',
    title: parsedArticle.title,
    slug,
    summary,
    bodyEditorJs,
    bodyMarkdown: parsedArticle.bodyMarkdown,
    plainTextSearch: [parsedArticle.title, parsedArticle.category.title, summary, bodyPlainText, tagIds.join(' ')]
      .filter(Boolean)
      .join('\n'),
    categoryId: parsedArticle.category.id,
    tagIds,
    linkedContentIds,
    unresolvedWikiLinks,
    backlinks: [],
    visibility: 'public',
    status: 'published',
    deliveryMode: 'wiki_page',
    ownerUid: 'system',
    ownerRole: 'Camp Lawton Staff Handbook',
    createdByUid: 'system',
    updatedByUid: 'system',
    reviewedByUid: 'system',
    publishedByUid: 'system',
    archivedAt: null,
    reviewDueAt: null,
    emergencyPriority: emergencyPriority(parsedArticle),
    isPinned: false,
    versionNumber: 1,
    sourceFile: `${SOURCE_FILE}#L${parsedArticle.headingLine}`,
    sourceHash,
    sourceMetadata: {
      file: SOURCE_FILE,
      category: parsedArticle.category.title,
      heading: parsedArticle.title,
      headingLine: parsedArticle.headingLine,
      contentStartLine: parsedArticle.contentStartLine,
      contentEndLine: parsedArticle.contentEndLine,
      sha256: sourceHash,
    },
  };
}

function nestedItemCount(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((count, item) => count + (item.items?.length ? item.items.length + nestedItemCount(item.items) : 0), 0);
}

function planStats(articles, sourceMarkdown) {
  const serializedBlocks = articles.map((article) => JSON.stringify(article.bodyEditorJs.blocks)).join('\n');
  const blockTypes = {};
  let nestedListItems = 0;
  articles.forEach((article) => article.bodyEditorJs.blocks.forEach((item) => {
    blockTypes[item.type] = (blockTypes[item.type] ?? 0) + 1;
    if (item.type === 'list') nestedListItems += nestedItemCount(item.data.items);
  }));

  return {
    blockTypes,
    nestedListItems,
    orderedLists: articles.flatMap((article) => article.bodyEditorJs.blocks)
      .filter((item) => item.type === 'list' && item.data.style === 'ordered').length,
    tables: blockTypes.table ?? 0,
    boldFragments: (serializedBlocks.match(/<strong>/g) ?? []).length,
    italicFragments: (serializedBlocks.match(/<em>/g) ?? []).length,
    mailtoLinks: (serializedBlocks.match(/href=\\?"mailto:/g) ?? []).length,
    articleLinks: (serializedBlocks.match(/href=\\?"\/wiki\/article\/handbook-/g) ?? []).length,
    songbookCategoryLinks: (serializedBlocks.match(/href=\\?"\/wiki\?category=songbook/g) ?? []).length,
    escapedBracketReferences: escapedBracketReferences(sourceMarkdown).length,
    radioPlaceholders: [...sourceMarkdown.matchAll(/\\\[([^\]\n]+?)\\\]/g)]
      .filter((match) => RADIO_PLACEHOLDERS.has(normalizeReference(match[1]))).length,
  };
}

function validatePlan(parsed, articles, sourceMarkdown) {
  const countByCategory = Object.fromEntries(CATEGORY_DEFINITIONS.map((category) => [category.id, 0]));
  articles.forEach((article) => { countByCategory[article.categoryId] += 1; });
  const ids = articles.map((article) => article.id);
  const slugs = articles.map((article) => article.slug);
  const idSet = new Set(ids);
  const blockIds = articles.flatMap((article) => article.bodyEditorJs.blocks.map((item) => item.id));
  const requiredFields = [
    'id', 'type', 'title', 'slug', 'summary', 'bodyEditorJs', 'bodyMarkdown', 'plainTextSearch',
    'categoryId', 'tagIds', 'linkedContentIds', 'unresolvedWikiLinks', 'backlinks', 'visibility',
    'status', 'deliveryMode', 'ownerUid', 'ownerRole', 'createdByUid', 'updatedByUid',
    'reviewedByUid', 'publishedByUid', 'archivedAt', 'reviewDueAt', 'emergencyPriority',
    'isPinned', 'versionNumber', 'sourceFile', 'sourceHash', 'sourceMetadata',
  ];
  const completeArticles = articles.filter((article) => requiredFields.every((field) => field in article));
  const validLinkGraph = articles.every((article) => (
    article.linkedContentIds.every((targetId) => (
      idSet.has(targetId)
      && articles.find((candidate) => candidate.id === targetId)?.backlinks.includes(article.id)
    ))
    && article.backlinks.every((sourceId) => (
      idSet.has(sourceId)
      && articles.find((candidate) => candidate.id === sourceId)?.linkedContentIds.includes(article.id)
    ))
  ));
  const unresolved = articles.flatMap((article) => article.unresolvedWikiLinks.map((label) => `${article.title}: ${label}`));
  const stats = planStats(articles, sourceMarkdown);

  const checks = [
    {
      name: 'category-markers',
      ok: parsed.categoryMarkers.length === CATEGORY_DEFINITIONS.length,
      detail: `${parsed.categoryMarkers.length}/${CATEGORY_DEFINITIONS.length} exact contentless H1 markers`,
    },
    {
      name: 'article-count',
      ok: articles.length === EXPECTED_ARTICLE_COUNT,
      detail: `${articles.length}/${EXPECTED_ARTICLE_COUNT} articles`,
    },
    {
      name: 'category-counts',
      ok: CATEGORY_DEFINITIONS.every((category) => countByCategory[category.id] === category.expectedArticles),
      detail: CATEGORY_DEFINITIONS.map((category) => `${category.title}: ${countByCategory[category.id]}`).join(', '),
    },
    {
      name: 'unique-identifiers',
      ok: new Set(ids).size === ids.length && new Set(slugs).size === slugs.length,
      detail: `${new Set(ids).size} IDs and ${new Set(slugs).size} slugs`,
    },
    {
      name: 'public-and-published',
      ok: articles.every((article) => article.visibility === 'public' && article.status === 'published'),
      detail: `${articles.filter((article) => article.visibility === 'public' && article.status === 'published').length}/${articles.length}`,
    },
    {
      name: 'complete-fields',
      ok: completeArticles.length === articles.length
        && articles.every((article) => article.summary && article.bodyEditorJs.blocks.length && article.tagIds.length && article.sourceHash),
      detail: `${completeArticles.length}/${articles.length} articles with summaries, blocks, tags, search text, ownership, and source metadata`,
    },
    {
      name: 'deterministic-blocks',
      ok: blockIds.every(Boolean)
        && new Set(blockIds).size === blockIds.length
        && articles.every((article) => article.bodyEditorJs.time === EDITOR_TIME),
      detail: `${blockIds.length} stable, unique block IDs; Editor.js time ${EDITOR_TIME}`,
    },
    {
      name: 'wiki-links',
      ok: unresolved.length === 0
        && stats.articleLinks === 7
        && stats.songbookCategoryLinks === 1
        && validLinkGraph,
      detail: `${stats.articleLinks} article links, ${stats.songbookCategoryLinks} Songbook category link, ${unresolved.length} unresolved; backlinks ${validLinkGraph ? 'consistent' : 'inconsistent'}`,
    },
    {
      name: 'radio-placeholders',
      ok: stats.radioPlaceholders === 3,
      detail: `${stats.radioPlaceholders}/3 placeholders left as text`,
    },
    {
      name: 'rich-markdown',
      ok: stats.boldFragments > 0
        && stats.italicFragments > 0
        && stats.orderedLists > 0
        && stats.nestedListItems > 0
        && stats.tables === 1
        && stats.mailtoLinks > 0,
      detail: `${stats.boldFragments} bold, ${stats.italicFragments} italic, ${stats.orderedLists} ordered lists, ${stats.nestedListItems} nested items, ${stats.tables} table, ${stats.mailtoLinks} mail links`,
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
    countByCategory,
    unresolved,
    stats,
  };
}

export function buildImportPlan(sourceMarkdown) {
  const parsed = parseHandbook(sourceMarkdown);
  const resolveReference = buildReferenceResolver(parsed.articles);
  const articles = parsed.articles.map((article) => createArticle(article, resolveReference));
  const articleById = new Map(articles.map((article) => [article.id, article]));

  articles.forEach((article) => article.linkedContentIds.forEach((targetId) => {
    const target = articleById.get(targetId);
    if (target && !target.backlinks.includes(article.id)) target.backlinks.push(article.id);
  }));

  const validation = validatePlan(parsed, articles, sourceMarkdown);
  if (!validation.ok) {
    const failures = validation.checks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.detail}`);
    throw new Error(`Handbook import validation failed:\n- ${failures.join('\n- ')}`);
  }

  return {
    source: {
      file: SOURCE_FILE,
      sha256: hash(sourceMarkdown),
      lines: parsed.sourceLineCount,
    },
    categories: CATEGORY_DEFINITIONS.map((category) => ({
      ...category,
      articles: validation.countByCategory[category.id],
    })),
    articles,
    validation,
  };
}

async function commitWrites(db, writes, label) {
  let committed = 0;
  for (let offset = 0; offset < writes.length; offset += MAX_BATCH_WRITES) {
    const chunk = writes.slice(offset, offset + MAX_BATCH_WRITES);
    const batch = db.batch();
    chunk.forEach((write) => write(batch));
    await batch.commit();
    committed += chunk.length;
    console.log(`${label}: committed ${committed}/${writes.length} writes.`);
  }
}

function isProtectedSongbook(documentData) {
  return String(documentData.categoryId ?? '').trim().toLowerCase() === 'songbook';
}

async function writeImportPlan(plan) {
  initAdmin();
  const db = getFirestore();
  const targetRefs = plan.articles.map((article) => db.collection('contentItems').doc(article.id));
  const targetSnapshots = await db.getAll(...targetRefs);
  const existingTargets = targetSnapshots.filter((document) => document.exists);
  const nonWikiCollisions = existingTargets.filter((document) => document.get('type') !== 'wiki');
  if (nonWikiCollisions.length) {
    throw new Error(
      `Refusing to overwrite non-wiki documents at handbook target IDs: ${nonWikiCollisions.map((document) => document.id).join(', ')}.`,
    );
  }

  const directSongbookCollisions = existingTargets.filter((document) => isProtectedSongbook(document.data()));
  if (directSongbookCollisions.length) {
    throw new Error(
      `Refusing to overwrite protected Songbook documents: ${directSongbookCollisions.map((document) => document.id).join(', ')}.`,
    );
  }

  const versionedTargets = existingTargets.filter((document) => Number(document.get('versionNumber') ?? 1) > 1);
  if (versionedTargets.length) {
    throw new Error(
      `Refusing to reset versioned handbook targets to v1: ${versionedTargets.map((document) => document.id).join(', ')}.`,
    );
  }

  const revisionPreflights = await Promise.all(targetSnapshots.map(async (document) => ({
    id: document.id,
    snapshot: await document.ref.collection('revisions').limit(2).get(),
  })));
  const targetsWithLaterRevisions = revisionPreflights.filter(({ snapshot }) => (
    snapshot.docs.some((revision) => revision.id !== 'v1')
  ));
  if (targetsWithLaterRevisions.length) {
    throw new Error(
      `Refusing to leave later revisions behind while replacing handbook targets: ${targetsWithLaterRevisions.map(({ id }) => id).join(', ')}.`,
    );
  }

  const existingSnapshot = await db.collection('contentItems').where('type', '==', 'wiki').get();
  const importedIds = new Set(plan.articles.map((article) => article.id));
  const existingById = new Map(existingSnapshot.docs.map((document) => [document.id, document]));
  const songbookDocuments = existingSnapshot.docs.filter((document) => isProtectedSongbook(document.data()));
  const protectedCollisions = songbookDocuments.filter((document) => importedIds.has(document.id));
  if (protectedCollisions.length) {
    throw new Error(`Refusing to overwrite protected Songbook documents: ${protectedCollisions.map((document) => document.id).join(', ')}.`);
  }

  const importWrites = [];
  for (const article of plan.articles) {
    const ref = db.collection('contentItems').doc(article.id);
    const existing = existingById.get(article.id);
    importWrites.push((batch) => batch.set(ref, {
      ...article,
      createdAt: existing?.data().createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      reviewedAt: FieldValue.serverTimestamp(),
      publishedAt: FieldValue.serverTimestamp(),
    }));
    importWrites.push((batch) => batch.set(ref.collection('revisions').doc('v1'), {
      id: 'v1',
      versionNumber: 1,
      status: 'published',
      bodyEditorJs: article.bodyEditorJs,
      bodyMarkdown: article.bodyMarkdown,
      plainTextSearch: article.plainTextSearch,
      changeSummary: `Imported from ${article.sourceFile}`,
      sourceFile: article.sourceFile,
      sourceHash: article.sourceHash,
      createdByUid: 'system',
      reviewedByUid: 'system',
      approvedByUid: 'system',
      publishedByUid: 'system',
      createdAt: FieldValue.serverTimestamp(),
      reviewedAt: FieldValue.serverTimestamp(),
      publishedAt: FieldValue.serverTimestamp(),
    }));
  }

  // Import first. If a later archive batch fails, the new handbook remains available.
  await commitWrites(db, importWrites, 'Handbook import');

  const archiveWrites = existingSnapshot.docs
    .filter((document) => !isProtectedSongbook(document.data()))
    .filter((document) => !importedIds.has(document.id))
    .map((document) => (batch) => batch.set(document.ref, {
      status: 'archived',
      visibility: 'admin_only',
      archivedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: 'system',
    }, { merge: true }));

  await commitWrites(db, archiveWrites, 'Archive replaced wiki content');
  return {
    importedArticles: plan.articles.length,
    importedWrites: importWrites.length,
    archivedArticles: archiveWrites.length,
    preservedSongbookArticles: songbookDocuments.length,
  };
}

function argumentValue(args, name) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length && !args[index + 1].startsWith('--')) return args[index + 1];
  return null;
}

function printHelp() {
  console.log(`Usage: node scripts/seed-handbook.mjs [options]\n\nOptions:\n  --write                Write the validated replacement to Firestore\n  --json                 Print the complete deterministic dry-run plan as JSON\n  --preview <id|title>   Print one generated article as JSON\n  --help                 Show this help\n\nWithout --write, the script performs a read-only dry run.`);
}

function printDryRun(plan) {
  console.log(`Validated ${plan.articles.length} public handbook articles from ${plan.source.file}:`);
  plan.categories.forEach((category) => console.log(`- ${category.title} (${category.id}): ${category.articles} articles`));
  console.log('\nValidation:');
  plan.validation.checks.forEach((check) => console.log(`- ${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`));
  console.log('\nArticles:');
  plan.articles.forEach((article) => {
    console.log(`- ${article.id}: ${article.title} (${article.categoryId}, ${article.bodyEditorJs.blocks.length} blocks)`);
  });
  console.log('\nDry run only. Add --write to import and archive all replaced non-Songbook wiki documents.');
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    printHelp();
    return;
  }
  if (!existsSync(SOURCE_PATH)) throw new Error(`Missing handbook source: ${SOURCE_PATH}`);

  const writeMode = args.includes('--write');
  const jsonMode = args.includes('--json');
  const preview = argumentValue(args, '--preview');
  if (writeMode && (jsonMode || preview)) throw new Error('--write cannot be combined with --json or --preview.');

  const sourceMarkdown = readFileSync(SOURCE_PATH, 'utf8');
  const plan = buildImportPlan(sourceMarkdown);

  if (jsonMode) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (preview) {
    const normalized = normalizeReference(preview);
    const article = plan.articles.find((candidate) => (
      normalizeReference(candidate.id) === normalized
      || normalizeReference(candidate.slug) === normalized
      || normalizeReference(candidate.title) === normalized
    ));
    if (!article) throw new Error(`No generated article matches “${preview}”.`);
    console.log(JSON.stringify(article, null, 2));
    return;
  }

  if (!writeMode) {
    printDryRun(plan);
    return;
  }

  console.log(`Writing ${plan.articles.length} validated public articles. Existing Songbook documents will not be changed.`);
  const result = await writeImportPlan(plan);
  console.log(`Import complete: ${result.importedArticles} articles, ${result.archivedArticles} old non-Songbook articles archived, ${result.preservedSongbookArticles} Songbook articles preserved exactly.`);
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
