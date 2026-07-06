import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

async function main() {
  // Read the JSON service account (avoid require)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const jsonPath = path.join(__dirname, 'camp-lawton-staff-hub-firebase-adminsdk-fbsvc-439f443121.json');
  const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  // Read markdown
  const mdContent = fs.readFileSync(path.join(__dirname, 'staffHandbookCL.md'), 'utf8');

  // Split into blocks
  const parts = mdContent.split('{Title');
  const handbookData = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const titleMatch = part.match(/^\s*=\s*["']([^"']*)["']\s*,/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim().toLowerCase();

    const contentStart = part.indexOf('"', titleMatch[0].length) + 1;
    let contentEnd = part.indexOf('"\n,', contentStart);
    if (contentEnd === -1) contentEnd = part.indexOf('",', contentStart);
    if (contentEnd === -1) {
      const closeBrace = part.lastIndexOf('}');
      contentEnd = part.lastIndexOf('"', closeBrace);
    }

    let content = part.substring(contentStart, contentEnd).trim();
    if (!content) continue;

    handbookData[title] = content;
  }

  console.log(`Parsed ${Object.keys(handbookData).length} sections from markdown.`);

  // Now query firestore for wiki items
  const snapshot = await db.collection('contentItems').where('type', '==', 'wiki').get();
  console.log(`Found ${snapshot.size} wiki articles in database.`);

  const batch = db.batch();
  let updatedCount = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    let title = data.title;

    // Add title overrides for matching
    const overrides = {
        'the aims of scouting': 'the aims and methods of scouting',
        'the methods of scouting': 'the aims and methods of scouting',
        'duties': 'staff expectations',
        'what makes a staff?': 'what makes a staff?',
        'customer service': 'customer service',
        'glossary': 'glossary',
        'ncs certification roles': 'ncs certification roles',
        'this is your life schedule': 'this is your life',
        'severe weather preparedness': 'severe weather preparedness',
        'safeguarding youth': 'safeguarding youth',
        'the camp lawton guidelines': 'policies and procedures',
        'health and safety': 'health and safety',
        'legal policies': 'legal policies and information',
        'camp opening procedures': 'camp opening procedures',
        'how to write funny': 'how to write funny',
        'writing songs': 'writing songs',
        'songbook index': 'songbook',
        'necessary paperwork': 'required paperwork',
        'packing list': 'packing list',
        'code of conduct': 'camp lawton summer camp staff commitment & code of conduct',
        'leadership directory': 'leadership contacts',
        'camp address and mail': 'camp mailing address'
    };

    let lookupTitle = title.toLowerCase();
    lookupTitle = overrides[lookupTitle] || lookupTitle;

    if (handbookData[lookupTitle]) {
      const markdownContent = handbookData[lookupTitle];

      const paragraphs = markdownContent.split('\n\n').filter(p => p.trim());
      const newBlocks = [];

      let blockId = 0;
      paragraphs.forEach(p => {
        p = p.trim();
        if (p.startsWith('#')) {
          const levelMatch = p.match(/^(#+)\s+(.*)/);
          if (levelMatch) {
            newBlocks.push({
              id: `block-${blockId++}`,
              type: 'header',
              data: { text: levelMatch[2].replace(/\*/g, ''), level: Math.min(levelMatch[1].length, 6) }
            });
          } else {
            newBlocks.push({
              id: `block-${blockId++}`,
              type: 'paragraph',
              data: { text: p.replace(/\*/g, '') }
            });
          }
        } else if (p.startsWith('* ') || p.startsWith('- ')) {
          const items = p.split('\n').map(item => item.replace(/^[\*\-]\s+/, '').replace(/\*/g, '').trim());
          newBlocks.push({
            id: `block-${blockId++}`,
            type: 'list',
            data: { style: 'unordered', items }
          });
        } else if (/^\d+\.\s+/.test(p)) {
          const items = p.split('\n').map(item => item.replace(/^\d+\.\s+/, '').replace(/\*/g, '').trim());
          newBlocks.push({
            id: `block-${blockId++}`,
            type: 'list',
            data: { style: 'ordered', items }
          });
        } else {
          newBlocks.push({
            id: `block-${blockId++}`,
            type: 'paragraph',
            data: { text: p.replace(/\*/g, '') }
          });
        }
      });

      const newBodyEditorJs = {
        time: Date.now(),
        version: '2.31.6',
        blocks: newBlocks
      };

      batch.update(doc.ref, {
        bodyEditorJs: newBodyEditorJs,
        plainTextSearch: markdownContent,
        updatedAt: new Date()
      });

      // Update the v1 revision too
      const revRef = doc.ref.collection('revisions').doc('v1');
      batch.update(revRef, {
        bodyEditorJs: newBodyEditorJs,
        plainTextSearch: markdownContent,
        updatedAt: new Date()
      });

      updatedCount++;
      console.log(`Will update: ${title} (matched to ${lookupTitle})`);
    } else {
      console.log(`Could not find content for: ${title} (lookup: ${lookupTitle})`);
    }
  });

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`Successfully updated ${updatedCount} articles in Firestore.`);
  } else {
    console.log("No articles to update.");
  }
}

main().catch(console.error);
