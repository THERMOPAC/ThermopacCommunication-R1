import React from 'react';
import { Helmet } from 'react-helmet';
import ItemMasterManagement from '@/components/item-master-management';
import AdminTools from '@/components/admin-tools';
import { useAuth } from '@/hooks/use-auth';

const ItemMasterPage = () => {
  const { user } = useAuth();
  const isSuperuser = user && user.role === 'Superuser';
  
  return (
    <>
      <Helmet>
        <title>Item Master | THERMOPAC Communication System</title>
      </Helmet>
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Item Master</h1>
        
        {/* Only show admin tools for Superuser */}
        {isSuperuser && <AdminTools />}
        
        <ItemMasterManagement />
      </div>
    </>
  );
};

export default ItemMasterPage;