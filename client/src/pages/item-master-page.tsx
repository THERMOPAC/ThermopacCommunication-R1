import React from 'react';
import { Helmet } from 'react-helmet';
import ItemMasterManagement from '@/components/item-master-management';

const ItemMasterPage = () => {
  return (
    <>
      <Helmet>
        <title>Item Master | THERMOPAC Communication System</title>
      </Helmet>
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Item Master</h1>
        <ItemMasterManagement />
      </div>
    </>
  );
};

export default ItemMasterPage;