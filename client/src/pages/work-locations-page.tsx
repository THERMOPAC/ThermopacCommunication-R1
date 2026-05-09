import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { WorkLocation, InsertWorkLocation } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertWorkLocationSchema } from "@shared/schema";
import {
  Plus,
  Edit,
  Users,
  MapPin,
  Clock,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Network,
  X,
} from "lucide-react";
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
import { z } from "zod";

type WorkLocationFormValues = z.infer<typeof insertWorkLocationSchema>;

type LocationUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  mobileNumber?: string | null;
  countryCode?: string | null;
};

const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

function IpTagInput({
  value,
  onChange,
}: {
  value: string[] | null | undefined;
  onChange: (val: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState("");
  const [inputError, setInputError] = useState("");
  const current = value ?? [];

  const addEntry = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    if (!CIDR_REGEX.test(trimmed)) {
      setInputError("Must be a valid IPv4 address or CIDR block (e.g. 192.168.1.0/24)");
      return;
    }
    if (current.includes(trimmed)) {
      setInputError("Already added");
      return;
    }
    onChange([...current, trimmed]);
    setInputVal("");
    setInputError("");
  };

  const removeEntry = (entry: string) => {
    onChange(current.filter((e) => e !== entry));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="e.g. 192.168.1.0/24 or 203.0.113.5"
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            setInputError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEntry();
            }
          }}
          className="flex-1"
        />
        <Button type="button" variant="secondary" size="sm" onClick={addEntry}>
          Add
        </Button>
      </div>
      {inputError && <p className="text-xs text-destructive">{inputError}</p>}
      {current.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {current.map((entry) => (
            <Badge key={entry} variant="secondary" className="flex items-center gap-1 pr-1">
              {entry}
              <button
                type="button"
                onClick={() => removeEntry(entry)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {current.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No IP restrictions — attendance allowed from any network.
        </p>
      )}
    </div>
  );
}

function LocationForm({
  form,
  onSubmit,
  isPending,
  onCancel,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<WorkLocationFormValues>>;
  onSubmit: (v: WorkLocationFormValues) => void;
  isPending: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Head Office Mumbai" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <FormControl>
                  <Input placeholder="Asia/Kolkata" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Complete address" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl>
                  <Input placeholder="Mumbai" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>State</FormLabel>
                <FormControl>
                  <Input placeholder="Maharashtra" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pincode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pincode</FormLabel>
                <FormControl>
                  <Input placeholder="400001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* GPS Location Settings */}
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            GPS Location Tracking
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </h4>
          <p className="text-xs text-muted-foreground">
            Set coordinates for geofence-based attendance. Leave empty to skip GPS verification.
          </p>
          <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
            Tip: right-click your location on Google Maps → "What's here?" to get exact coordinates.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="latitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Latitude</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      placeholder="19.0760"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="longitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Longitude</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      placeholder="72.8777"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="radiusMeters"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Radius (meters)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="100"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value ? parseInt(e.target.value) : null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* IP Restrictions */}
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Network className="h-4 w-4" />
            Network IP Restrictions
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </h4>
          <p className="text-xs text-muted-foreground">
            Restrict attendance to specific office networks. Enter IPv4 addresses or CIDR blocks.
          </p>
          <FormField
            control={form.control}
            name="ipRestrictions"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <IpTagInput
                    value={field.value as string[] | null | undefined}
                    onChange={(val) => field.onChange(val)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active Location</FormLabel>
                <div className="text-sm text-muted-foreground">
                  Enable this location for attendance tracking
                </div>
              </div>
              <FormControl>
                <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function WorkLocationsPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WorkLocation | null>(null);
  const [usersLocationId, setUsersLocationId] = useState<number | null>(null);
  const [usersLocationName, setUsersLocationName] = useState("");

  const { data: locations = [], isLoading } = useQuery<WorkLocation[]>({
    queryKey: ["/api/work-locations"],
  });

  const { data: locationUsers = [], isLoading: usersLoading } = useQuery<LocationUser[]>({
    queryKey: ["/api/work-locations", usersLocationId, "users"],
    enabled: usersLocationId !== null,
  });

  const addForm = useForm<WorkLocationFormValues>({
    resolver: zodResolver(insertWorkLocationSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      country: "India",
      latitude: null,
      longitude: null,
      radiusMeters: 100,
      ipRestrictions: [],
      timezone: "Asia/Kolkata",
      isActive: true,
    },
  });

  const editForm = useForm<WorkLocationFormValues>({
    resolver: zodResolver(insertWorkLocationSchema),
  });

  const addLocationMutation = useMutation({
    mutationFn: async (data: WorkLocationFormValues) =>
      apiRequest("POST", "/api/work-locations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-locations"] });
      setIsAddDialogOpen(false);
      addForm.reset();
      toast({ title: "Location added", description: "Work location created successfully." });
    },
    onError: (error: Error) =>
      toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateLocationMutation = useMutation({
    mutationFn: async (data: { id: number; values: WorkLocationFormValues }) =>
      apiRequest("PUT", `/api/work-locations/${data.id}`, data.values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-locations"] });
      setIsEditDialogOpen(false);
      setEditingLocation(null);
      toast({ title: "Location updated", description: "Changes saved successfully." });
    },
    onError: (error: Error) =>
      toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest("PATCH", `/api/work-locations/${id}/toggle-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-locations"] });
      toast({ title: "Status updated" });
    },
    onError: (error: Error) =>
      toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/work-locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-locations"] });
      toast({ title: "Location deleted" });
    },
    onError: (error: Error) =>
      toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const handleEdit = (location: WorkLocation) => {
    setEditingLocation(location);
    editForm.reset({
      name: location.name,
      address: location.address,
      city: location.city,
      state: location.state,
      pincode: location.pincode,
      country: location.country || "India",
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      radiusMeters: location.radiusMeters ?? 100,
      ipRestrictions: location.ipRestrictions ?? [],
      timezone: location.timezone || "Asia/Kolkata",
      isActive: location.isActive,
    });
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-h-screen overflow-y-auto">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Work Location Management
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Manage office locations, GPS geofences, and IP restrictions for attendance tracking
            </p>
          </div>

          {/* Add Location */}
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-2xl max-h-[85vh] overflow-y-auto"
              aria-describedby="add-location-desc"
            >
              <DialogHeader>
                <DialogTitle>Add New Work Location</DialogTitle>
                <p id="add-location-desc" className="text-sm text-muted-foreground">
                  Create a new work location with GPS and network restrictions for attendance.
                </p>
              </DialogHeader>
              <LocationForm
                form={addForm}
                onSubmit={(v) => addLocationMutation.mutate(v)}
                isPending={addLocationMutation.isPending}
                onCancel={() => setIsAddDialogOpen(false)}
                submitLabel="Add Location"
              />
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location Name</TableHead>
                <TableHead>City & State</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead>IP Restrictions</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location) => {
                const hasGps = location.latitude != null && location.longitude != null;
                const ipCount = location.ipRestrictions?.length ?? 0;
                return (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">
                      {location.name}
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {location.address}
                      </div>
                    </TableCell>
                    <TableCell>
                      {location.city}, {location.state}
                      <br />
                      <span className="text-xs text-muted-foreground">{location.pincode}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={location.isActive ? "default" : "secondary"}>
                        {location.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {hasGps ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white gap-1">
                          <MapPin className="h-3 w-3" />
                          Set
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground gap-1">
                          <MapPin className="h-3 w-3" />
                          No GPS
                        </Badge>
                      )}
                      {hasGps && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          ±{location.radiusMeters ?? 100}m
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {ipCount > 0 ? (
                        <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
                          <Network className="h-3 w-3" />
                          {ipCount} rule{ipCount !== 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground gap-1">
                          <Network className="h-3 w-3" />
                          Any network
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3" />
                        {location.timezone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View assigned users"
                          onClick={() => {
                            setUsersLocationId(location.id);
                            setUsersLocationName(location.name);
                          }}
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit location"
                          onClick={() => handleEdit(location)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={location.isActive ? "Deactivate" : "Activate"}
                          onClick={() => toggleStatusMutation.mutate(location.id)}
                        >
                          {location.isActive ? (
                            <ToggleRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-gray-400" />
                          )}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Delete location">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Work Location</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{location.name}"? This cannot be
                                undone. Deletion will fail if users are still assigned here.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteLocationMutation.mutate(location.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {locations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No work locations found. Add your first location to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
          aria-describedby="edit-location-desc"
        >
          <DialogHeader>
            <DialogTitle>Edit Work Location</DialogTitle>
            <p id="edit-location-desc" className="text-sm text-muted-foreground">
              Update GPS coordinates, network restrictions, and location details.
            </p>
          </DialogHeader>
          <LocationForm
            form={editForm}
            onSubmit={(v) => editingLocation && updateLocationMutation.mutate({ id: editingLocation.id, values: v })}
            isPending={updateLocationMutation.isPending}
            onCancel={() => { setIsEditDialogOpen(false); setEditingLocation(null); }}
            submitLabel="Save Changes"
          />
        </DialogContent>
      </Dialog>

      {/* Assigned Users Panel */}
      <Sheet
        open={usersLocationId !== null}
        onOpenChange={(open) => { if (!open) setUsersLocationId(null); }}
      >
        <SheetContent className="w-[400px] sm:w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Assigned Users
            </SheetTitle>
            <p className="text-sm text-muted-foreground">{usersLocationName}</p>
          </SheetHeader>

          <div className="mt-6">
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : locationUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No users assigned to this location.
                <br />
                Assign users via the User Management page.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {locationUsers.length} user{locationUsers.length !== 1 ? "s" : ""} assigned
                </p>
                {locationUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">{u.username}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {u.role}
                    </Badge>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2">
                  To reassign users, use the User Management page.
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
