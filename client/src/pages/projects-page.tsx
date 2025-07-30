import React, { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, Search, Loader2, Edit, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function ProjectsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [location, navigate] = useLocation();

  // State management
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [keepVisible, setKeepVisible] = useState<boolean>(false);

  // Parse URL parameters
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const projectParam = params.get('project');
    const keepParam = params.get('keep');

    if (projectParam) {
      setSelectedProjectId(projectParam);
    }
    
    if (keepParam === 'true') {
      setKeepVisible(true);
    }
  }, [location]);

  // Update URL function
  const updateURL = (projectId: string, keep: boolean) => {
    const params = new URLSearchParams();
    if (projectId) {
      params.set('project', projectId);
    }
    if (keep && projectId) {
      params.set('keep', 'true');
    }
    
    const newUrl = params.toString() ? `/projects?${params.toString()}` : '/projects';
    navigate(newUrl);
  };

  // Fetch projects
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/projects'],
    enabled: !!user,
  });

  // Fetch project items for selected project
  const { data: projectItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['/api/project-items', selectedProjectId],
    enabled: !!selectedProjectId,
  });

  // Get selected project
  const selectedProject = projects?.find((p: any) => p.id.toString() === selectedProjectId);

  // Filter and organize project items
  const { filteredProjectItems, organizedProjectItems } = useMemo(() => {
    if (!projectItems) {
      return { filteredProjectItems: [], organizedProjectItems: { makeItems: [], buyItems: [], otherItems: [] } };
    }

    // Filter based on search query
    let filtered = projectItems;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = projectItems.filter((item: any) => 
        item.masterItem?.itemCode?.toLowerCase().includes(query) ||
        item.masterItem?.description?.toLowerCase().includes(query) ||
        item.status?.toLowerCase().includes(query) ||
        item.masterItem?.makeOrBuy?.toLowerCase().includes(query)
      );
    }

    // Organize by Make/Buy
    const makeItems = filtered.filter((item: any) => item.masterItem?.makeOrBuy === 'Make');
    const buyItems = filtered.filter((item: any) => item.masterItem?.makeOrBuy === 'Buy');
    const otherItems = filtered.filter((item: any) => 
      !item.masterItem?.makeOrBuy || 
      (item.masterItem?.makeOrBuy !== 'Make' && item.masterItem?.makeOrBuy !== 'Buy')
    );

    return {
      filteredProjectItems: filtered,
      organizedProjectItems: { makeItems, buyItems, otherItems }
    };
  }, [projectItems, searchQuery]);

  // Status color helper
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-500 text-white';
      case 'completed':
        return 'bg-blue-500 text-white';
      case 'cancelled':
        return 'bg-red-500 text-white';
      case 'in progress':
        return 'bg-orange-500 text-white';
      case 'on hold':
        return 'bg-yellow-500 text-black';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  // Make/Buy color helper
  const getMakeOrBuyColor = (makeOrBuy: string) => {
    switch (makeOrBuy?.toLowerCase()) {
      case 'make':
        return 'bg-blue-100 text-blue-800';
      case 'buy':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Handle edit click
  const handleEditClick = (item: any) => {
    if (item.masterItem?.id) {
      sessionStorage.setItem('editMasterItemId', item.masterItem.id.toString());
      const returnPath = window.location.pathname + window.location.search;
      sessionStorage.setItem('returnToPage', returnPath);
      navigate('/item-master');
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Projects | THERMOPAC Communication System</title>
      </Helmet>

      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight pl-4">Projects</h1>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Project Items</CardTitle>
            <CardDescription>
              Select a project and view all associated items in hierarchical or table format.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="project-filter">Select Project</Label>
                  <Select 
                    value={selectedProjectId} 
                    onValueChange={(value) => {
                      setSelectedProjectId(value);
                      updateURL(value, keepVisible);
                      setSearchQuery(''); // Clear search when project changes
                    }}
                    disabled={projectsLoading}
                  >
                    <SelectTrigger className="w-full md:w-[400px]">
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
                        projects.map((project: any) => (
                          <SelectItem key={project.id} value={project.id.toString()}>
                            {project.projectCode}: {project.projectName}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Keep Visible checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="keep-visible" 
                    checked={keepVisible}
                    onCheckedChange={(checked) => {
                      const isChecked = checked === true;
                      setKeepVisible(isChecked);
                      updateURL(selectedProjectId, isChecked);
                    }}
                  />
                  <Label htmlFor="keep-visible" className="text-sm font-medium">
                    Keep Visible
                  </Label>
                  <span className="text-xs text-gray-500">
                    (Maintain project filter when returning from item pages)
                  </span>
                </div>

                {/* Search Field */}
                {selectedProjectId && projectItems && projectItems.length > 0 && (
                  <div className="relative">
                    <Label htmlFor="project-items-search">Search Project Items</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="project-items-search"
                        className="pl-8 w-full md:w-[400px]"
                        placeholder="Search items by code, name, status, or make/buy..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={itemsLoading}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Project Info */}
              {selectedProject && (
                <div className="text-right space-y-2">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg">{selectedProject.projectName}</h3>
                    <div className="flex items-center gap-2 justify-end">
                      <Badge className={getStatusColor(selectedProject.status)}>
                        {selectedProject.status}
                      </Badge>
                      {projectItems && (
                        <Badge variant="outline" className="px-3 py-1">
                          {filteredProjectItems?.length || 0} of {projectItems.length} {projectItems.length === 1 ? 'item' : 'items'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Display content based on search */}
            {selectedProjectId && searchQuery.trim() !== '' && (
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">Search Results</h3>
                {itemsLoading ? (
                  <div className="flex items-center h-12">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    <span>Loading project items...</span>
                  </div>
                ) : !filteredProjectItems || filteredProjectItems.length === 0 ? (
                  <div className="text-muted-foreground py-4 border border-border rounded-md text-center">
                    No items found matching "{searchQuery}"
                  </div>
                ) : (
                  <div className="border border-border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-auto whitespace-nowrap">Item Code</TableHead>
                          <TableHead className="w-auto">Description</TableHead>
                          <TableHead className="w-auto whitespace-nowrap">Make/Buy</TableHead>
                          <TableHead className="w-auto whitespace-nowrap">Status</TableHead>
                          <TableHead className="w-auto whitespace-nowrap">Quantity</TableHead>
                          <TableHead className="w-[100px] whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProjectItems.map((item: any) => (
                          <TableRow key={item.id} className="hover:bg-muted/50">
                            <TableCell className="font-medium">{item.masterItem?.itemCode || 'N/A'}</TableCell>
                            <TableCell>{item.masterItem?.description || 'N/A'}</TableCell>
                            <TableCell>
                              <Badge className={getMakeOrBuyColor(item.masterItem?.makeOrBuy)}>
                                {item.masterItem?.makeOrBuy || 'N/A'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(item.status)}>
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.quantity} {item.masterItem?.uom || ''}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleEditClick(item)}
                                >
                                  Edit
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    sessionStorage.setItem('returnPage', window.location.pathname + window.location.search);
                                    sessionStorage.setItem('editMasterItemId', item.masterItem?.id?.toString() || '');
                                    window.location.href = '/item-master';
                                  }}
                                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                >
                                  ⮥
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {/* Hierarchical View when no search */}
            {selectedProjectId && searchQuery.trim() === '' && (
              <div>
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
                  <div className="space-y-6">
                    {/* Make Items Section */}
                    {organizedProjectItems.makeItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Badge className="bg-blue-100 text-blue-800 font-semibold">
                            🔧 Make Items ({organizedProjectItems.makeItems.length})
                          </Badge>
                        </div>
                        <div className="grid gap-4">
                          {organizedProjectItems.makeItems.map((item: any) => (
                            <Card key={item.id} className="border-l-4 border-l-blue-400">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-base">
                                        {item.masterItem?.itemCode || 'N/A'}
                                      </h4>
                                      <Badge className={getMakeOrBuyColor(item.masterItem?.makeOrBuy || '')}>
                                        {item.masterItem?.makeOrBuy || 'N/A'}
                                      </Badge>
                                      <Badge className={getStatusColor(item.status || 'Not Started')}>
                                        {item.status || 'Not Started'}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                      {item.masterItem?.description || 'N/A'}
                                    </p>
                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                      <span>Quantity: {item.quantity.toLocaleString()}</span>
                                      <span>UOM: {item.masterItem?.uom || 'N/A'}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditClick(item)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        sessionStorage.setItem('returnPage', window.location.pathname + window.location.search);
                                        sessionStorage.setItem('editMasterItemId', item.masterItem?.id?.toString() || '');
                                        window.location.href = '/item-master';
                                      }}
                                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    >
                                      <ArrowRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Buy Items Section */}
                    {organizedProjectItems.buyItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Badge className="bg-green-100 text-green-800 font-semibold">
                            🛒 Buy Items ({organizedProjectItems.buyItems.length})
                          </Badge>
                        </div>
                        <div className="grid gap-4">
                          {organizedProjectItems.buyItems.map((item: any) => (
                            <Card key={item.id} className="border-l-4 border-l-green-400">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-base">
                                        {item.masterItem?.itemCode || 'N/A'}
                                      </h4>
                                      <Badge className={getMakeOrBuyColor(item.masterItem?.makeOrBuy || '')}>
                                        {item.masterItem?.makeOrBuy || 'N/A'}
                                      </Badge>
                                      <Badge className={getStatusColor(item.status || 'Not Started')}>
                                        {item.status || 'Not Started'}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                      {item.masterItem?.description || 'N/A'}
                                    </p>
                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                      <span>Quantity: {item.quantity.toLocaleString()}</span>
                                      <span>UOM: {item.masterItem?.uom || 'N/A'}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditClick(item)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        sessionStorage.setItem('returnPage', window.location.pathname + window.location.search);
                                        sessionStorage.setItem('editMasterItemId', item.masterItem?.id?.toString() || '');
                                        window.location.href = '/item-master';
                                      }}
                                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    >
                                      <ArrowRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other Items Section */}
                    {organizedProjectItems.otherItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Badge className="bg-gray-100 text-gray-800 font-semibold">
                            📦 Other Items ({organizedProjectItems.otherItems.length})
                          </Badge>
                        </div>
                        <div className="grid gap-4">
                          {organizedProjectItems.otherItems.map((item: any) => (
                            <Card key={item.id} className="border-l-4 border-l-gray-400">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-base">
                                        {item.masterItem?.itemCode || 'N/A'}
                                      </h4>
                                      <Badge className={getMakeOrBuyColor(item.masterItem?.makeOrBuy || '')}>
                                        {item.masterItem?.makeOrBuy || 'N/A'}
                                      </Badge>
                                      <Badge className={getStatusColor(item.status || 'Not Started')}>
                                        {item.status || 'Not Started'}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                      {item.masterItem?.description || 'N/A'}
                                    </p>
                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                      <span>Quantity: {item.quantity.toLocaleString()}</span>
                                      <span>UOM: {item.masterItem?.uom || 'N/A'}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditClick(item)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        sessionStorage.setItem('returnPage', window.location.pathname + window.location.search);
                                        sessionStorage.setItem('editMasterItemId', item.masterItem?.id?.toString() || '');
                                        window.location.href = '/item-master';
                                      }}
                                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    >
                                      <ArrowRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
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