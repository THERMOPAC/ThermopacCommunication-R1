import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UserProfile from "@/components/user-profile";
import UserPasswordChange from "@/components/user-password-change";
import Layout from "@/components/layout";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="container py-6">
        <div className="mb-6">
          <Link href="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-8">Profile Settings</h1>

        <div className="grid gap-8 md:grid-cols-2">
          {/* User Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <UserProfile user={user!} />
            </CardContent>
          </Card>

          {/* Change Password Card */}
          <UserPasswordChange />
        </div>
      </div>
    </Layout>
  );
}