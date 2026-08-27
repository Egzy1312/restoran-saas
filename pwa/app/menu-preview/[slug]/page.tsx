import MenuPreviewClient from './menu-preview-client';

export default function MenuPreviewPage({ params }: { params: { slug: string } }) {
  return <MenuPreviewClient slug={params.slug} />;
}
