import React from "react";
import Messages from "@/components/messages";
import Layout from "@/components/layout";

function EmailsPage() {
  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Messages />
      </div>
    </Layout>
  );
}

export default EmailsPage;