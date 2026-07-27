import { OrderDetailWorkspace } from '@/components/admin-workspaces';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailWorkspace id={id} />;
}
