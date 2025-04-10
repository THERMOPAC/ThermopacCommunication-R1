import React from 'react';
import { Helmet } from 'react-helmet';
import ItemMasterManagement from '@/components/item-master-management';
import AdminTools from '@/components/admin-tools';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

const ItemMasterPage = () => {
  const { user } = useAuth();
  const isSuperuser = user && user.role === 'Superuser';
  
  return (
    <>
      <Helmet>
        <title>Item Master | THERMOPAC Communication System</title>
      </Helmet>
      <div className="container mx-auto p-4">
        <Link to="/" className="inline-flex items-center text-sm text-primary hover:text-primary/80 transition-colors mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold mb-6">Item Master</h1>
        
        {/* Only show admin tools for Superuser */}
        {isSuperuser && <AdminTools />}
        
        <ItemMasterManagement />
      </div>
    </>
  );
};

export default ItemMasterPage;