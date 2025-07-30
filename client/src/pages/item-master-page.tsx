import React from 'react';
import { Helmet } from 'react-helmet';
import ItemMasterManagement from '@/components/item-master-management';
import Layout from '@/components/layout';

const ItemMasterPage = () => {
  return (
    <Layout>
      <Helmet>
        <title>Item Master | THERMOPAC Communication System</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight pl-4">Item Master</h1>
        </div>
        
        <ItemMasterManagement />
      </div>
    </Layout>
  );
};

export default ItemMasterPage;