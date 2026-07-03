import WikiArticleClient from './WikiArticleClient';

export default async function WikiArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WikiArticleClient id={id} />;
}
