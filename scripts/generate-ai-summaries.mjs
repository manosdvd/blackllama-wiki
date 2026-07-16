import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseHandbook } from './seed-handbook.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read API key from .env.local
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const match = envContent.match(/GEMINI_API_KEY=(.+)/);
const API_KEY = match ? match[1].trim() : null;

if (!API_KEY) {
  console.error("No GEMINI_API_KEY found in .env.local");
  process.exit(1);
}

const sourcePath = path.join(__dirname, '../staffHandbookWiki.md');
const outputPath = path.join(__dirname, 'ai_summaries.json');

// Parse markdown to get all articles
const markdown = fs.readFileSync(sourcePath, 'utf8');
const parsed = parseHandbook(markdown);
const articles = parsed.articles;

console.log(`Found ${articles.length} articles to summarize.`);

// Load existing summaries if available to allow resuming
let summaries = {};
if (fs.existsSync(outputPath)) {
  try {
    summaries = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    console.log(`Loaded ${Object.keys(summaries).length} existing summaries.`);
  } catch {
    // Ignore corrupt file
  }
}

async function generateSummary(article) {
  const prompt = `You are a helpful assistant. Write an extremely concise, professional summary of the following Camp Lawton staff handbook article.
The summary MUST be between 10 and 15 words. Do not exceed 15 words.
Output your response in exactly this JSON format:
{
  "summary": "the summary here"
}

Article Title: ${article.title}
Content:
${article.bodyMarkdown.slice(0, 4000)}`;

  let retries = 3;
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
          console.warn(`Rate limited for "${article.title}". Retrying in 30 seconds...`);
          await new Promise((r) => setTimeout(r, 30000));
          retries--;
          continue;
        }
        console.error(`API Error for "${article.title}":`, await res.text());
        return null;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Empty response from model");
      }
      
      const parsed = JSON.parse(text);
      return parsed.summary;
    } catch (err) {
      console.error(`Error summarizing "${article.title}":`, err.message);
      retries--;
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  return null;
}

async function run() {
  let count = 0;
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    
    // Skip if summary already generated and matches length rule
    if (summaries[article.title]) {
      const words = summaries[article.title].split(/\s+/).length;
      if (words <= 16) {
        console.log(`[${i + 1}/${articles.length}] Skipping "${article.title}" (already summarized: ${words} words)`);
        continue;
      }
    }

    console.log(`[${i + 1}/${articles.length}] Summarizing "${article.title}"...`);
    const summary = await generateSummary(article);
    
    if (summary) {
      const words = summary.split(/\s+/).length;
      console.log(`  -> "${summary}" (${words} words)`);
      summaries[article.title] = summary;
      
      // Save periodically to prevent progress loss
      fs.writeFileSync(outputPath, JSON.stringify(summaries, null, 2));
      count++;
    } else {
      console.error(`Failed to summarize "${article.title}"`);
    }

    // Sleep to avoid rate limits (free tier is 15 RPM, which is 1 request per 4 seconds)
    await new Promise((r) => setTimeout(r, 6000));
  }

  console.log(`Done! Generated ${count} new summaries. Total summaries: ${Object.keys(summaries).length}`);
}

run().catch(console.error);
