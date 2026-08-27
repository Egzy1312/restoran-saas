import MenuClient from './menu-client';

export default function TableMenuPage({ params }: { params: { slug: string; tableId: string } }) {
  // `tableId` u URL-u je zapravo opaki qr_code_token (vidi napomenu u
  // menu-client.tsx) - naziv rute je zadrzan kao u specifikaciji
  // (`/r/{restaurant_slug}/t/{table_id}`), ali vrijednost se razrjesava
  // preko API-ja prije ikakve upotrebe kao stvarni table_id.
  return <MenuClient slug={params.slug} tableToken={params.tableId} />;
}
