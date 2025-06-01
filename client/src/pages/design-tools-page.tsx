import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette, Ruler, Layers, Grid, Package, Wrench } from "lucide-react";

export default function DesignToolsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Design Tools</h1>
          <p className="text-gray-600 mt-2">
            Access comprehensive design and engineering tools for project development
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* CAD Tools */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">CAD Tools</CardTitle>
                <CardDescription>
                  Computer-aided design applications
                </CardDescription>
              </div>
              <Ruler className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Access professional CAD software for 2D and 3D design work
              </p>
            </CardContent>
          </Card>

          {/* Design Library */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Design Library</CardTitle>
                <CardDescription>
                  Reusable design components
                </CardDescription>
              </div>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Browse and manage standard design components and templates
              </p>
            </CardContent>
          </Card>

          {/* Drawing Management */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Drawing Management</CardTitle>
                <CardDescription>
                  Technical drawing repository
                </CardDescription>
              </div>
              <Grid className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Organize and version control technical drawings and blueprints
              </p>
            </CardContent>
          </Card>

          {/* 3D Modeling */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">3D Modeling</CardTitle>
                <CardDescription>
                  Advanced 3D design tools
                </CardDescription>
              </div>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create detailed 3D models for visualization and analysis
              </p>
            </CardContent>
          </Card>

          {/* Design Validation */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Design Validation</CardTitle>
                <CardDescription>
                  Design verification tools
                </CardDescription>
              </div>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Validate designs against specifications and standards
              </p>
            </CardContent>
          </Card>

          {/* Design Collaboration */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Design Collaboration</CardTitle>
                <CardDescription>
                  Team collaboration platform
                </CardDescription>
              </div>
              <Palette className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Collaborate on designs with team members and stakeholders
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Design Tools Suite
            </CardTitle>
            <CardDescription>
              Comprehensive design and engineering capabilities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The Design Tools module will provide integrated access to:
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground ml-4">
                <li>• Professional CAD software integration</li>
                <li>• Design document management system</li>
                <li>• 3D modeling and visualization tools</li>
                <li>• Design collaboration workflows</li>
                <li>• Version control for design files</li>
                <li>• Design approval and review processes</li>
                <li>• Standard component libraries</li>
                <li>• Design validation and verification tools</li>
              </ul>
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-medium text-blue-900">
                  Coming Soon
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  This module is currently under development and will be available in a future release.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}