import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCaption,
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { 
  PlusCircle, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  MoreHorizontal, 
  FileText, 
  Download, 
  Printer,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

// Define interface for the Material Identification record
interface MaterialIdentification {
  id: number;
  material_identification_id: string;
  project_id: number;
  project_name: string;
  project_number: string;
  material_description: string;
  material_code: string;
  specification: string;
  material_grade: string;
  material_status: string;
  inspection_date: string;
  inspector_name: string;
  heat_number: string;
  created_at: string;
}

// Define interface for pagination information
interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Project interface
interface Project {
  id: number;
  code: string;
  name: string;
  description?: string;
  status: string;
  created_at: string;
}

export default function MaterialIdentificationListNewPage() {
  const [location, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showRecords, setShowRecords] = useState(false);
  const [keepVisible, setKeepVisible] = useState(false);
  
  // Parse URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectParam = urlParams.get('project');
    const keepParam = urlParams.get('keep');
    
    if (projectParam) {
      const projectId = parseInt(projectParam);
      setSelectedProjectId(projectId);
      setShowRecords(true);
    }
    
    if (keepParam === 'true') {
      setKeepVisible(true);
    }
  }, [location]);
  
  // Update URL when project filter changes
  const updateURL = (projectId: number | null, keep: boolean) => {
    const params = new URLSearchParams();
    if (projectId && keep) {
      params.set('project', projectId.toString());
      params.set('keep', 'true');
    }
    
    const newUrl = params.toString() ? 
      `/quality/material-identification?${params.toString()}` : 
      '/quality/material-identification';
    
    window.history.replaceState({}, '', newUrl);
  };
  
  // Fetch projects for the dropdown
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/projects'],
    queryFn: async () => {
      const response = await fetch('/api/projects');
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      return response.json() as Promise<Project[]>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Filter to only active projects
  const activeProjects = projectsData?.filter(project => 
    project.status?.toLowerCase() === 'active' || project.status?.toLowerCase() === 'in progress'
  ) || [];
  
  // Fetch Material Identification records with search, project filter, and pagination
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/quality/material-identification', searchTerm, selectedProjectId, currentPage, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedProjectId) params.append('projectId', selectedProjectId.toString());
      params.append('page', currentPage.toString());
      params.append('limit', limit.toString());
      
      const response = await fetch(`/api/quality/material-identification?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch material identification records');
      }
      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
    enabled: showRecords && !!selectedProjectId, // Only fetch when a project is selected and showRecords is true
  });
  
  // Trigger search after a short delay
  useEffect(() => {
    const delay = setTimeout(() => {
      setCurrentPage(1); // Reset to first page when search changes
      refetch();
    }, 500);
    
    return () => clearTimeout(delay);
  }, [searchTerm, refetch]);
  
  // Format date for display
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (error) {
      return dateString;
    }
  };
  
  // Get color for material status badge
  const getStatusColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return 'bg-green-500';
      case 'rejected':
        return 'bg-red-500';
      case 'hold':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  // Handle navigation to view/edit pages
  const handleView = (id: number) => {
    if (keepVisible && selectedProjectId) {
      navigate(`/quality/material-identification/view/${id}?project=${selectedProjectId}&keep=true`);
    } else {
      navigate(`/quality/material-identification/view/${id}`);
    }
  };
  
  const handleEdit = (id: number) => {
    if (keepVisible && selectedProjectId) {
      navigate(`/quality/material-identification/edit/${id}?project=${selectedProjectId}&keep=true`);
    } else {
      navigate(`/quality/material-identification/edit/${id}`);
    }
  };
  
  const handleCreate = () => {
    // Pass selected project information to the new record page
    if (selectedProjectId) {
      const selectedProject = activeProjects.find(p => p.id === selectedProjectId);
      if (selectedProject) {
        // Store project data in sessionStorage for auto-population
        sessionStorage.setItem('materialId_selectedProject', JSON.stringify({
          id: selectedProject.id,
          code: selectedProject.code,
          name: selectedProject.name
        }));
      }
    }
    navigate('/quality/material-identification/new');
  };
  
  // Generate pagination items
  const renderPaginationItems = (totalPages: number, currentPage: number) => {
    const items = [];
    
    // Always show first page
    items.push(
      <PaginationItem key="first">
        <PaginationLink 
          isActive={currentPage === 1}
          onClick={() => setCurrentPage(1)}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );
    
    // Show ellipsis if there are more than 5 pages and current page is > 3
    if (totalPages > 5 && currentPage > 3) {
      items.push(
        <PaginationItem key="ellipsis-1">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }
    
    // Show pages around current page
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      if (i === 1 || i === totalPages) continue; // Skip first and last as they're always shown
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            isActive={currentPage === i}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    // Show ellipsis if there are more than 5 pages and current page is < totalPages - 2
    if (totalPages > 5 && currentPage < totalPages - 2) {
      items.push(
        <PaginationItem key="ellipsis-2">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }
    
    // Always show last page if there's more than one page
    if (totalPages > 1) {
      items.push(
        <PaginationItem key="last">
          <PaginationLink
            isActive={currentPage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    return items;
  };
  
  const records: MaterialIdentification[] = data?.data || [];
  const pagination: PaginationInfo = data?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 };
  
  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Material Identification Records</CardTitle>
              <CardDescription>
                Manage and view all material identification records.
              </CardDescription>
            </div>
            <Button 
              onClick={handleCreate}
              disabled={!selectedProjectId}
              className={!selectedProjectId ? "opacity-50 cursor-not-allowed" : ""}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Add New Record
            </Button>
          </CardHeader>
          <CardContent>
            {/* Project selection section */}
            <div className="mb-6 border rounded-md p-4 bg-gray-50">
              <h3 className="text-lg font-medium mb-3">Project Selection</h3>
              <p className="text-sm text-gray-500 mb-4">
                Select a project to view its material identification records.
              </p>
              
              <div className="space-y-4">
                <div className="flex-1">
                  {projectsLoading ? (
                    <div className="h-10 flex items-center">Loading projects...</div>
                  ) : (
                    <select 
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                      value={selectedProjectId || ""}
                      onChange={(e) => {
                        const id = e.target.value ? parseInt(e.target.value) : null;
                        setSelectedProjectId(id);
                        // Automatically show records when project is selected
                        setShowRecords(!!id);
                        // Update URL when project changes
                        updateURL(id, keepVisible);
                      }}
                    >
                      <option value="">-- Select a project --</option>
                      {activeProjects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.code} - {project.name}
                        </option>
                      ))}
                    </select>
                  )}
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
                    (Maintain project filter when returning from edit/view pages)
                  </span>
                </div>
              </div>
            </div>
            
            {/* Search and filter bar - only show when project is selected */}
            {selectedProjectId && (
              <div className="flex items-center mb-6 gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    type="text"
                    placeholder="Search by ID, description, material, heat number..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="ml-auto">
                      <Filter className="h-4 w-4 mr-2" />
                      Filter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Filter by</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Status: All</DropdownMenuItem>
                    <DropdownMenuItem>Status: Accepted</DropdownMenuItem>
                    <DropdownMenuItem>Status: Rejected</DropdownMenuItem>
                    <DropdownMenuItem>Status: Hold</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Date Range</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            
            {/* Display state messages based on conditions */}
            {!selectedProjectId ? (
              <div className="flex flex-col items-center justify-center h-40 text-center text-gray-500">
                <h3 className="text-lg font-medium">Please select a project</h3>
                <p className="text-sm">Material identification records will be displayed after selecting a project.</p>
              </div>
            ) : isLoading ? (
              <div className="flex justify-center items-center h-40">
                <span className="loading loading-spinner text-primary"></span>
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center text-gray-500">
                <FileText className="h-10 w-10 mb-2" />
                <h3 className="text-lg font-medium">No records found</h3>
                <p className="text-sm">No material identification records exist for this project. Create a new record or select a different project.</p>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>MI ID</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Material Description</TableHead>
                        <TableHead>Material Grade</TableHead>
                        <TableHead>Heat Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Inspection Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">{record.material_identification_id}</TableCell>
                          <TableCell>{record.project_number}</TableCell>
                          <TableCell>{record.material_description}</TableCell>
                          <TableCell>{record.material_grade}</TableCell>
                          <TableCell>{record.heat_number}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(record.material_status)}>
                              {record.material_status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(record.inspection_date)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleView(record.id)}
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEdit(record.id)}
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" title="More options">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download Certificate
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Printer className="h-4 w-4 mr-2" />
                                    Print Record
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                {/* Pagination */}
                {pagination.totalPages > 0 && (
                  <div className="mt-6">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious 
                            href="#" 
                            onClick={(e) => {
                              e.preventDefault();
                              if (currentPage > 1) setCurrentPage(currentPage - 1);
                            }} 
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                        
                        {renderPaginationItems(pagination.totalPages, currentPage)}
                        
                        <PaginationItem>
                          <PaginationNext 
                            href="#" 
                            onClick={(e) => {
                              e.preventDefault();
                              if (currentPage < pagination.totalPages) setCurrentPage(currentPage + 1);
                            }}
                            className={currentPage === pagination.totalPages ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                    
                    <div className="text-center mt-2 text-sm text-gray-500">
                      Showing {Math.min((currentPage - 1) * limit + 1, pagination.total)} to {Math.min(currentPage * limit, pagination.total)} of {pagination.total} records
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}