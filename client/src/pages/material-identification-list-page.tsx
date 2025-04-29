import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { PlusCircle, Search, FileDown, Filter } from "lucide-react";

import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Define types for Material Identification
interface MaterialIdentification {
  id: number;
  material_identification_id: string;
  project_id: number;
  project_name: string;
  project_number: string;
  inspection_order_number: string;
  material_description: string;
  material_code: string;
  specification: string;
  material_grade: string;
  heat_number: string;
  batch_number: string | null;
  mill_name: string;
  mill_test_certificate_number: string;
  quantity: string;
  dimensions: string;
  material_status: string;
  inspector_name: string;
  inspection_date: string;
  remarks: string | null;
  created_at: string;
}

interface Project {
  id: number;
  name: string;
  projectNumber: string;
}

export default function MaterialIdentificationListPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // State for filters
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedMaterialGrade, setSelectedMaterialGrade] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

  // Fetch material identifications
  const { data: materialIdentifications = [], isLoading: isLoadingMI } = useQuery<MaterialIdentification[]>({
    queryKey: ['/api/quality/material-identification'],
  });

  // Fetch projects for filter
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  // Filter material identifications based on search term and filters
  const filteredMI = materialIdentifications.filter((mi) => {
    // Apply search term filter (search in multiple fields)
    const searchFields = [
      mi.material_identification_id,
      mi.material_description,
      mi.material_code,
      mi.heat_number,
      mi.mill_test_certificate_number,
      mi.inspector_name,
    ];
    
    const matchesSearch = searchTerm === "" || 
      searchFields.some(field => 
        field && field.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    // Apply project filter
    const matchesProject = selectedProject === "" || 
      mi.project_id.toString() === selectedProject;
    
    // Apply status filter
    const matchesStatus = selectedStatus === "" || 
      mi.material_status === selectedStatus;
    
    // Apply material grade filter
    const matchesMaterialGrade = selectedMaterialGrade === "" || 
      mi.material_grade === selectedMaterialGrade;
    
    // Apply date filters
    let matchesDateRange = true;
    if (fromDate) {
      const inspectionDate = new Date(mi.inspection_date);
      matchesDateRange = inspectionDate >= fromDate;
    }
    if (toDate) {
      const inspectionDate = new Date(mi.inspection_date);
      matchesDateRange = matchesDateRange && inspectionDate <= toDate;
    }
    
    return matchesSearch && matchesProject && matchesStatus && 
      matchesMaterialGrade && matchesDateRange;
  });

  // Get unique material grades for filter dropdown
  const uniqueMaterialGrades = Array.from(
    new Set(materialIdentifications.map(mi => mi.material_grade))
  );

  // Handle export to CSV/Excel
  const handleExport = () => {
    // Implementation for export functionality
    toast({
      title: "Export initiated",
      description: "Your export is being prepared",
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Material Identification</h1>
            <p className="text-muted-foreground mt-2">
              View and manage material identification records
            </p>
          </div>
          <Button onClick={() => navigate("/quality/material-identification/new")}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add New Material
          </Button>
        </div>

        <div className="flex flex-col space-y-4">
          {/* Search and Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search & Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search input */}
                <div className="flex">
                  <div className="relative w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by ID, description, heat number..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* Project filter */}
                <div>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by Project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Projects</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.projectNumber} - {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status filter */}
                <div>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Statuses</SelectItem>
                      <SelectItem value="Accepted">Accepted</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                      <SelectItem value="Hold">Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Material Grade filter */}
                <div>
                  <Select value={selectedMaterialGrade} onValueChange={setSelectedMaterialGrade}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by Material Grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Grades</SelectItem>
                      {uniqueMaterialGrades.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* From Date filter */}
                <div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal w-full",
                          !fromDate && "text-muted-foreground"
                        )}
                      >
                        <Filter className="mr-2 h-4 w-4" />
                        {fromDate ? format(fromDate, "PPP") : "From Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={fromDate}
                        onSelect={setFromDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* To Date filter */}
                <div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal w-full",
                          !toDate && "text-muted-foreground"
                        )}
                      >
                        <Filter className="mr-2 h-4 w-4" />
                        {toDate ? format(toDate, "PPP") : "To Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={toDate}
                        onSelect={setToDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Clear Filters button */}
                <div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedProject("");
                      setSelectedStatus("");
                      setSelectedMaterialGrade("");
                      setFromDate(undefined);
                      setToDate(undefined);
                    }}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>

                {/* Export button */}
                <div>
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    className="w-full"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Material Identification Records Table */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Material Identification Records</CardTitle>
                <CardDescription>
                  {filteredMI.length} records found
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingMI ? (
                <div className="flex justify-center items-center h-[400px]">
                  Loading material identification records...
                </div>
              ) : filteredMI.length === 0 ? (
                <div className="flex justify-center items-center h-[400px]">
                  No material identification records found.
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>MI ID</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Material Description</TableHead>
                        <TableHead>Material Grade</TableHead>
                        <TableHead>Heat Number</TableHead>
                        <TableHead>Inspection Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMI.map((mi) => (
                        <TableRow key={mi.id}>
                          <TableCell className="font-medium">
                            {mi.material_identification_id}
                          </TableCell>
                          <TableCell>{mi.project_number}</TableCell>
                          <TableCell>{mi.material_description}</TableCell>
                          <TableCell>{mi.material_grade}</TableCell>
                          <TableCell>{mi.heat_number}</TableCell>
                          <TableCell>
                            {format(new Date(mi.inspection_date), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                mi.material_status === "Accepted"
                                  ? "bg-green-500 hover:bg-green-600"
                                  : mi.material_status === "Rejected"
                                  ? "bg-red-500 hover:bg-red-600"
                                  : ""
                              }
                              variant={
                                mi.material_status === "Accepted"
                                  ? "default"
                                  : mi.material_status === "Rejected"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {mi.material_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                navigate(`/quality/material-identification/${mi.id}`)
                              }
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}