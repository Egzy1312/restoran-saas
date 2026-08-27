import ReservationClient from './reservation-client';

export default function BookPage({ params }: { params: { slug: string } }) {
  return <ReservationClient slug={params.slug} />;
}
