import React from "react";
import InternalMessages from "@/components/internal-messages";
import Layout from "@/components/layout";

function MessagesPage() {
  return (
    <Layout>
      <div className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">Internal Messages</h1>
        <InternalMessages />
      </div>
    </Layout>
  );
}

export default MessagesPage;