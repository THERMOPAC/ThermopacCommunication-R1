import EmailManager from "@/components/email-manager";
import PageHeader from "@/components/page-header";

export default function CommunicationPage() {
  return (
    <div className="space-y-4">
      <PageHeader 
        title="Communication Center" 
        description="Manage emails and internal messages in one place"
      />
      <EmailManager />
    </div>
  );
}