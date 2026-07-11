import sys
import json
import re

with open('staffHandbookCL.md', 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split('{Title')
pages = []

for part in parts[1:]:
    part = part.strip()
    
    # extract title
    title_match = re.search(r'^\s*=?\s*"([^"]+)"', part)
    if not title_match:
        title_match = re.search(r'^\s*:\s*"([^"]+)"', part)
    title = title_match.group(1) if title_match else "Unknown"

    block_inner = part
    if block_inner.endswith('}'):
        block_inner = block_inner[:-1].strip()
        
    cat_match = re.search(r'"([^"]+)"\s*,\s*[vV]isible to\s*(.*?)$', block_inner)
    if cat_match:
        category = cat_match.group(1)
        visibility = cat_match.group(2).replace('"', '').strip()
        content_raw = block_inner[:cat_match.start()].strip()
    else:
        category = "Camp Culture and History"
        visibility = "Staff"
        content_raw = block_inner
        
    # We must remove the title declaration from the start of content_raw
    # It usually looks like `="Title",\n" ...` or `="Title"\n"...`
    content_raw = re.sub(r'^\s*=?\s*"?[^"]+"?\s*,?\s*', '', content_raw, count=1)
    
    if content_raw.startswith('Active code:'):
        # some blocks are flowcharts, we keep them
        pass
    else:
        if content_raw.startswith('"'):
            content_raw = content_raw[1:]
    
    if content_raw.endswith('"') or content_raw.endswith('",'):
        content_raw = content_raw.rstrip(',').rstrip('"')
        
    md_content = content_raw.strip()
    
    clean_text = re.sub(r'[#*>-]', '', md_content).strip()
    clean_text = re.sub(r'\s+', ' ', clean_text)
    summary = clean_text[:170] + "..." if len(clean_text) > 170 else clean_text
    
    pages.append({
        "id": re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-'),
        "title": title,
        "content_markdown": md_content,
        "section": category,
        "visibility": visibility,
        "status": "published",
        "summary": summary
    })

with open('camp_lawton_staff_handbook_wiki_pages_final.json', 'w', encoding='utf-8') as f:
    json.dump({"pages": pages}, f, indent=2)

print(f"Parsed {len(pages)} pages.")
