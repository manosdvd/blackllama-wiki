fetch('http://localhost:3000/api/wiki/articles')
  .then(res => res.json())
  .then(data => {
    if (data.articles) {
      console.log(`Found ${data.articles.length} articles`);
      console.log(data.articles.map(a => `${a.title} - visibility: ${a.visibility} - blocks: ${a.bodyEditorJs?.blocks?.length}`).join('\n'));
    } else {
      console.log(data);
    }
  })
  .catch(console.error);
