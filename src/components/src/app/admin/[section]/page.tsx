import { AdminConsole } from "@/components/admin-console";

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <AdminConsole initialSection={section} />;
}

