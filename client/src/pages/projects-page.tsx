import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Building2, Calendar, User } from "lucide-react";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";

interface Project {
  id: number;
  projectName: string;
  projectCode: string;
  customerName: string;
  customerId: number;
  status: string;
  startDate: string;
  targetEndDate: string;
  description: string;
}

interface ProjectItem {
  id: number;
  projectId: number;
  itemId: number;
  quantity: number;
  status: string;
  masterItem?: {
    id: number;
    item_code: string;
    description: string;
    specification: string;
    uom: string;
    make_or_buy: string;
    supplier: string;
  };
}

export default function ProjectsPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Fetch all projects for the dropdown
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/design/projects'],
  });

  // Fetch project items when a project is selected
  const { data: projectItems, isLoading: itemsLoading } = useQuery<ProjectItem[]>({
    queryKey: [`/api/projects/${selectedProjectId}/items`],
    enabled: !!selectedProjectId,
  });

  const selectedProject = projects?.find(p => p.id.toString() === selectedProjectId);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-500 text-white';
      case 'completed': return 'bg-blue-500 text-white';
      case 'on_hold': return 'bg-yellow-500 text-black';
      case 'cancelled': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getMakeOrBuyColor = (makeOrBuy: string) => {
    switch (makeOrBuy?.toLowerCase()) {
      case 'make': return 'bg-blue-100 text-blue-800';
      case 'buy': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Projects | THERMOPAC Communication System</title>
      </Helmet>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-600 mt-2">Select a project to view associated items and details</p>
          </div>
        </div>

        {/* Available Projects Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Available Projects
            </CardTitle>
            <CardDescription>
              Select a project from the dropdown to view all associated items
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Project Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Select Project</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={projectsLoading ? "Loading projects..." : "Choose a project..."} />
                </SelectTrigger>
                <SelectContent>
                  {projectsLoading ? (
                    <SelectItem value="loading" disabled>
                      <div className="flex items-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading projects...
                      </div>
                    </SelectItem>
                  ) : !projects || projects.length === 0 ? (
                    <SelectItem value="no-projects" disabled>
                      No projects available
                    </SelectItem>
                  ) : (
                    projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.projectName} ({project.projectCode}) – {project.customerName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Selected Project Info */}
            {selectedProject && (
              <Card className="bg-blue-50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg">{selectedProject.projectName}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          <span>{selectedProject.customerName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {new Date(selectedProject.startDate).toLocaleDateString()} - 
                            {selectedProject.targetEndDate ? new Date(selectedProject.targetEndDate).toLocaleDateString() : 'TBD'}
                          </span>
                        </div>
                      </div>
                      {selectedProject.description && (
                        <p className="text-sm text-gray-600 mt-2">{selectedProject.description}</p>
                      )}
                    </div>
                    <Badge className={getStatusColor(selectedProject.status)}>
                      {selectedProject.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Project Items Table */}
            {selectedProjectId && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Project Items</h3>
                  {projectItems && (
                    <Badge variant="outline" className="px-3 py-1">
                      {projectItems.length} {projectItems.length === 1 ? 'item' : 'items'}
                    </Badge>
                  )}
                </div>

                {itemsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mr-2" />
                    <span>Loading project items...</span>
                  </div>
                ) : !projectItems || projectItems.length === 0 ? (
                  <div className="text-center py-12 border rounded-lg">
                    <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Items Found</h3>
                    <p className="text-gray-600">
                      This project doesn't have any items associated with it yet.
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>UOM</TableHead>
                          <TableHead>Make/Buy</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projectItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.masterItem?.item_code || 'N/A'}</TableCell>
                            <TableCell>{item.masterItem?.description || 'N/A'}</TableCell>
                            <TableCell>{item.quantity.toLocaleString()}</TableCell>
                            <TableCell>{item.masterItem?.uom || 'N/A'}</TableCell>
                            <TableCell>
                              <Badge className={getMakeOrBuyColor(item.masterItem?.make_or_buy || '')}>
                                {item.masterItem?.make_or_buy || 'N/A'}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.masterItem?.supplier || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                                {item.status || 'Not Started'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}