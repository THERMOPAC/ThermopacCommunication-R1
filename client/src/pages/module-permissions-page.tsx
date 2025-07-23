import Layout from "@/components/layout";
import ModulePermissionsManagement from "@/components/module-permissions-management";

export default function ModulePermissionsPage() {
  return (
    <Layout>
      <div className="container py-6">
        <h1 className="text-3xl font-bold mb-6 pl-4">Module Permissions Management</h1>
        <ModulePermissionsManagement />
      </div>
    </Layout>
  );
}