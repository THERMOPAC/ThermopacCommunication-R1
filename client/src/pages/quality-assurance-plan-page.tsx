import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  FileText, 
  Search, 
  Edit, 
  Copy, 
  Check, 
  Clock, 
  AlertCircle,
  Download,
  Filter
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface QAP {
  id: number;
  projectId: number;
  templateId: number;
  title: string;
  clientName: string;
  equipmentType: string;
  standards: string | null;
  revision: string;
  preparedBy: number;
  approvedBy: number | null;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  project: {
    id: number;
    code: string;
    name: string;
  };
  preparedByUser: {
    id: number;
    username: string;
  };
  approvedByUser?: {
    id: number;
    username: string;
  };
}

export default function QualityAssurancePlanPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Fetch all QAPs
  const { data: qaps, isLoading, error } = useQuery<QAP[]>({
    queryKey: ['/api/quality/generated-qaps'],
    refetchOnWindowFocus: true,
  });

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="flex items-center gap-1">
          <Clock size={12} /> Draft
        </Badge>;
      case 'in-review':
        return <Badge variant="secondary" className="flex items-center gap-1">
          <Search size={12} /> In Review
        </Badge>;
      case 'approved':
        return <Badge variant="default" className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-200">
          <Check size={12} /> Approved
        </Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle size={12} /> Rejected
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Filter QAPs by search term and status
  const filteredQAPs = qaps?.filter(qap => {
    const matchesSearch = qap.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      qap.project.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      qap.project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      qap.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch && (statusFilter ? qap.status === statusFilter : true);
  }) || [];

  return (
    <Layout>
      <Helmet>
        <title>Quality Assurance Plan | Thermopac</title>
      </Helmet>
      
      <div className="space-y-8 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Quality Assurance Plan</h1>
            <p className="text-muted-foreground">
              Create and manage Quality Assurance Plans for your projects.
            </p>
          </div>
          <Link href="/quality-assurance-plan/create">
            <Button className="flex items-center gap-2">
              <Plus size={16} />
              Create QAP
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, project code, or client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8"
              />
            </div>
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in-review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <div className="p-6 text-center text-destructive">
                <p>Error loading QAPs. Please try again later.</p>
              </div>
            ) : filteredQAPs.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter ? "No QAPs match your filters." : "No Quality Assurance Plans found. Click on \"Create QAP\" to get started."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>QAP Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Revision</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQAPs.map((qap) => (
                    <TableRow key={qap.id}>
                      <TableCell className="font-medium">QAP-{qap.project.code}-{qap.id.toString().padStart(3, '0')}</TableCell>
                      <TableCell>{qap.title}</TableCell>
                      <TableCell>{qap.project.code} - {qap.project.name}</TableCell>
                      <TableCell>{qap.equipmentType}</TableCell>
                      <TableCell>Rev. {qap.revision}</TableCell>
                      <TableCell><StatusBadge status={qap.status} /></TableCell>
                      <TableCell>{format(new Date(qap.createdAt), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLocation(`/quality-assurance-plan/${qap.id}`)}
                            title="View QAP"
                          >
                            <FileText size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLocation(`/quality-assurance-plan/${qap.id}/edit`)}
                            title="Edit QAP"
                            disabled={qap.status === 'approved'}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(`/api/quality/generated-qaps/${qap.id}/export`, '_blank')}
                            title="Export QAP"
                          >
                            <Download size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}