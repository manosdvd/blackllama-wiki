import TopicClient from './TopicClient';

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TopicClient id={id} />;
}
