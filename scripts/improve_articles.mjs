import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const match = envContent.match(/GEMINI_API_KEY=(.+)/);
const API_KEY = match ? match[1].trim() : null;

if (!API_KEY) {
  console.error("No GEMINI_API_KEY found in .env.local");
  process.exit(1);
}

const inputPath = path.join(__dirname, '../camp_lawton_staff_handbook_wiki_pages_final.json');
const outputPath = path.join(__dirname, '../camp_lawton_staff_handbook_wiki_pages_improved.json');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const pages = data.pages;

async function improveArticle(page) {
  const prompt = `You are tasked with writing a concise summary for a Camp Lawton staff handbook wiki article.
The article title is: ${page.title}
The current content is:
${page.content_markdown}

Provide a short summary (1-3 sentences) of the article. Do not include any other text.
Output your response in exactly this JSON format (no markdown code blocks, just raw JSON):
{
  "summary": "The short summary here..."
}`;

  let retries = 5;
  while (retries > 0) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`Rate limited for ${page.title}. Retrying in 60s...`);
          await new Promise(r => setTimeout(r, 60000));
          retries--;
          continue;
        }
        console.error(`API Error for ${page.title}:`, await res.text());
        return page;
      }

      const resJson = await res.json();
      const generatedText = resJson.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(generatedText);

      return {
        ...page,
        summary: parsed.summary || page.summary
      };
    } catch (err) {
      console.error(`Error processing ${page.title}:`, err.message);
      return page;
    }
  }
  return page;
}

async function run() {
  console.log(`Processing ${pages.length} pages...`);
  const improvedPages = [];
  
  for (let i = 0; i < pages.length; i++) {
    console.log(`Processing page ${i + 1} of ${pages.length}: ${pages[i].title}`);
    
    let retries = 10;
    let success = false;
    while(retries > 0 && !success) {
      const result = await improveArticle(pages[i]);
      if (result) {
        improvedPages.push(result);
        success = true;
      } else {
        retries--;
      }
    }
    
    // Sleep 15.5 seconds to strictly enforce < 4 RPM (Free tier limit is 5 RPM)
    if (i < pages.length - 1) {
      await new Promise(r => setTimeout(r, 15500));
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify({ pages: improvedPages }, null, 2));
  console.log('Done! Wrote improved articles to camp_lawton_staff_handbook_wiki_pages_improved.json');
}

run();
