import TakeawayClient from './takeaway-client';

export default function TakeawayPage({ params }: { params: { slug: string } }) {
  return <TakeawayClient slug={params.slug} />;
}
