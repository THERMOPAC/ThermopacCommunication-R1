import React from 'react';
import { Helmet } from 'react-helmet';
import ItemMasterManagement from '@/components/item-master-management';
import AdminTools from '@/components/admin-tools';
import { useAuth } from '@/hooks/use-auth';
import Layout from '@/components/layout';

const ItemMasterPage = () => {
  const { user } = useAuth();
  const isSuperuser = user && user.role === 'Superuser';
  
  return (
    <Layout>
      <Helmet>
        <title>Item Master | THERMOPAC Communication System</title>
      </Helmet>
      <div>
        <h1 className="text-3xl font-bold mb-6 pl-4">Item Master</h1>
        
        {/* Only show admin tools for Superuser */}
        {isSuperuser && <AdminTools />}
        
        <ItemMasterManagement />
      </div>
    </Layout>
  );
};

export default ItemMasterPage;