import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Plus, Edit, Trash2, Users } from "lucide-react";
import Layout from "@/components/layout";

// Team Leader Config schema
const teamLeaderConfigSchema = z.object({
  teamNumber: z.number().min(1, { message: "Team number must be at least 1" }),
  leaderName: z.string().min(1, { message: "Leader name is required" }),
});

type TeamLeaderConfigFormValues = z.infer<typeof teamLeaderConfigSchema>;

interface TeamLeaderConfig {
  teamNumber: number;
  leaderName: string;
  updatedBy: number | null;
  updatedAt: Date;
}

export default function ProductionTeamManagement() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamLeaderConfig | null>(null);

  // Fetch production teams
  const {
    data: teams = [],
    isLoading: isLoadingTeams,
    error: teamsError
  } = useQuery<TeamLeaderConfig[]>({
    queryKey: ['/api/production/teams/config'],
    queryFn: async () => {
      const response = await fetch('/api/production/teams/config');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch production teams");
      }
      return response.json();
    },
  });

  // Add team mutation
  const addTeamMutation = useMutation({
    mutationFn: async (data: TeamLeaderConfigFormValues) => {
      return apiRequest('/api/production/teams/config', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/teams/config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production/teams'] });
      setIsAddDialogOpen(false);
      addForm.reset();
      toast({
        title: "Production Team Added",
        description: "Production team has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Adding Team",
        description: error.message || "An error occurred while adding the production team.",
        variant: "destructive",
      });
    },
  });

  // Update team mutation
  const updateTeamMutation = useMutation({
    mutationFn: async (data: TeamLeaderConfigFormValues & { originalTeamNumber: number }) => {
      return apiRequest(`/api/production/teams/config/${data.originalTeamNumber}`, {
        method: 'PUT',
        body: JSON.stringify({
          teamNumber: data.teamNumber,
          leaderName: data.leaderName,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/teams/config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production/teams'] });
      setIsEditDialogOpen(false);
      setEditingTeam(null);
      editForm.reset();
      toast({
        title: "Production Team Updated",
        description: "Production team has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Updating Team",
        description: error.message || "An error occurred while updating the production team.",
        variant: "destructive",
      });
    },
  });

  // Delete team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamNumber: number) => {
      return apiRequest(`/api/production/teams/config/${teamNumber}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/teams/config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production/teams'] });
      toast({
        title: "Production Team Deleted",
        description: "Production team has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Deleting Team",
        description: error.message || "An error occurred while deleting the production team.",
        variant: "destructive",
      });
    },
  });

  // Add form
  const addForm = useForm<TeamLeaderConfigFormValues>({
    resolver: zodResolver(teamLeaderConfigSchema),
    defaultValues: {
      teamNumber: 1,
      leaderName: "",
    },
  });

  // Edit form
  const editForm = useForm<TeamLeaderConfigFormValues>({
    resolver: zodResolver(teamLeaderConfigSchema),
    defaultValues: {
      teamNumber: 1,
      leaderName: "",
    },
  });

  // Handle add team
  const onAddSubmit = (data: TeamLeaderConfigFormValues) => {
    addTeamMutation.mutate(data);
  };

  // Handle edit team
  const onEditSubmit = (data: TeamLeaderConfigFormValues) => {
    if (editingTeam) {
      updateTeamMutation.mutate({
        ...data,
        originalTeamNumber: editingTeam.teamNumber,
      });
    }
  };

  // Handle edit button click
  const handleEditClick = (team: TeamLeaderConfig) => {
    setEditingTeam(team);
    editForm.reset({
      teamNumber: team.teamNumber,
      leaderName: team.leaderName,
    });
    setIsEditDialogOpen(true);
  };

  // Handle delete team
  const handleDeleteTeam = (teamNumber: number) => {
    deleteTeamMutation.mutate(teamNumber);
  };

  // Show loading state
  if (isLoadingTeams) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  // Show error state
  if (teamsError) {
    return (
      <Layout>
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold text-red-600">Error Loading Teams</h2>
          <p className="mt-2 text-gray-600">
            Failed to load production teams. Please try again.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>Production Team Management | Thermopac</title>
      </Helmet>
      
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold">Production Team Management</h1>
            </div>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Team
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Production Team</DialogTitle>
                <DialogDescription>
                  Create a new production team with a team leader.
                </DialogDescription>
              </DialogHeader>
              <Form {...addForm}>
                <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                  <FormField
                    control={addForm.control}
                    name="teamNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team Number</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Enter team number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="leaderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Leader Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter leader name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={addTeamMutation.isPending}>
                      {addTeamMutation.isPending ? "Adding..." : "Add Team"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Production Teams</CardTitle>
            <CardDescription>
              Manage production teams and their leaders. Changes here will be reflected in work order assignments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No production teams</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating a new production team.
                </p>
                <div className="mt-6">
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Team
                  </Button>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team Number</TableHead>
                    <TableHead>Team Code</TableHead>
                    <TableHead>Leader Name</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((team) => (
                    <TableRow key={team.teamNumber}>
                      <TableCell className="font-medium">{team.teamNumber}</TableCell>
                      <TableCell>Production Team-{team.teamNumber}</TableCell>
                      <TableCell>{team.leaderName}</TableCell>
                      <TableCell>
                        {new Date(team.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(team)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Production Team</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete Production Team-{team.teamNumber} ({team.leaderName})? 
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteTeam(team.teamNumber)}
                                  disabled={deleteTeamMutation.isPending}
                                >
                                  {deleteTeamMutation.isPending ? "Deleting..." : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Production Team</DialogTitle>
              <DialogDescription>
                Update the production team information.
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="teamNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Number</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter team number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          disabled
                        />
                      </FormControl>
                      <FormDescription>
                        Team number cannot be changed
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="leaderName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Leader Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter leader name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={updateTeamMutation.isPending}>
                    {updateTeamMutation.isPending ? "Updating..." : "Update Team"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}