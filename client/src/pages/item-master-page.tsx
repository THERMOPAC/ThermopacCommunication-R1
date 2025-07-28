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
      <div>
        <h1 className="text-3xl font-bold mb-6 pl-4">Item Master</h1>
        <ItemMasterManagement />
      </div>
    </Layout>
  );
};

export default ItemMasterPage;