
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserPlus, MoreHorizontal, Trash2, UserCog, Shield, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import { useUsers, User } from "@/hooks/useUsers";
import { RefreshCw } from "lucide-react";

export default function AdminUsersPage() {
  const { users, isLoading, deleteUser, updateUserLevel, updateUserStatus, addUser, refetch } = useUsers();
  const [activeTab, setActiveTab] = useState<"all" | "active" | "pending" | "inactive">("all");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof User | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });
  
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    level_id: 1,
    status_users: "active" as "active" | "inactive" | "pending",
    email_verified: false,
    subscription_tier: "Free" as "Free" | "Premium"
  });
  
  const sortedAndFilteredUsers = useMemo(() => {
    let filtered = users.filter((user) => {
      if (activeTab === "all") return true;
      return user.status_users === activeTab;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [users, activeTab, sortConfig]);

  // Reset selections when filtered users change
  useEffect(() => {
    setSelectedUsers(new Set());
    setSelectAll(false);
  }, [sortedAndFilteredUsers]);

  const handleSort = (key: keyof User) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key: keyof User) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="ml-1 h-4 w-4" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-1 h-4 w-4" />
      : <ArrowDown className="ml-1 h-4 w-4" />;
  };
  
  const handleAddUser = async () => {
    const result = await addUser(newUser);
    if (result) {
      setShowNewUserDialog(false);
      // Reset form
      setNewUser({
        name: "",
        email: "",
        level_id: 1,
        status_users: "active",
        email_verified: false,
        subscription_tier: "Free"
      });
    }
  };

  const handleDeleteUser = async () => {
    if (selectedUser) {
      await deleteUser(selectedUser.id);
      setShowDeleteDialog(false);
      setSelectedUser(null);
    }
  };

  const handleUpdateLevel = async (userId: string, levelId: number) => {
    await updateUserLevel(userId, levelId);
  };

  const handleUpdateStatus = async (userId: string, status: "active" | "pending" | "inactive") => {
    await updateUserStatus(userId, status);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(sortedAndFilteredUsers.map(user => user.id)));
    }
    setSelectAll(!selectAll);
  };

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
    setSelectAll(newSelected.size === sortedAndFilteredUsers.length && sortedAndFilteredUsers.length > 0);
  };

  const getUserType = (levelId: number | null) => {
    if (levelId === 2) return "Administrator";
    return "Investor";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">User Management</h1>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button onClick={() => setShowNewUserDialog(true)} className="w-full sm:w-auto">
            <UserPlus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add New User</span>
            <span className="sm:hidden">Add User</span>
          </Button>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 sm:gap-4">
        <Button
          variant={activeTab === "all" ? "default" : "outline"}
          onClick={() => setActiveTab("all")}
          className="relative"
        >
          All Users
          <Badge variant="secondary" className="ml-2 bg-secondary">{users.length}</Badge>
        </Button>
        <Button
          variant={activeTab === "pending" ? "default" : "outline"}
          onClick={() => setActiveTab("pending")}
          className="relative"
        >
          Pending Verification
          <Badge variant="secondary" className="ml-2 bg-secondary">
            {users.filter(user => user.status_users === "pending").length}
          </Badge>
        </Button>
        <Button
          variant={activeTab === "active" ? "default" : "outline"}
          onClick={() => setActiveTab("active")}
          className="relative"
        >
          Active
          <Badge variant="secondary" className="ml-2 bg-secondary">
            {users.filter(user => user.status_users === "active").length}
          </Badge>
        </Button>
        <Button
          variant={activeTab === "inactive" ? "default" : "outline"}
          onClick={() => setActiveTab("inactive")}
          className="relative"
        >
          Inactive
          <Badge variant="secondary" className="ml-2 bg-secondary">
            {users.filter(user => user.status_users === "inactive").length}
          </Badge>
        </Button>
      </div>
      
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 hidden sm:table-cell">
                  <Checkbox 
                    className="ml-2" 
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-12 hidden sm:table-cell"></TableHead>
                <TableHead>
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('name')}
                  >
                    User
                    {getSortIcon('name')}
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('level_id')}
                  >
                    User Type
                    {getSortIcon('level_id')}
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('status_users')}
                  >
                    Status
                    {getSortIcon('status_users')}
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('email_verified')}
                  >
                    Email Verification
                    {getSortIcon('email_verified')}
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('subscription_tier')}
                  >
                    Account Type
                    {getSortIcon('subscription_tier')}
                  </button>
                </TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="flex items-center justify-center">
                    <div className="loading-circle" />
                    <span className="ml-3">Loading users...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : sortedAndFilteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              sortedAndFilteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="hidden sm:table-cell">
                    <Checkbox 
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => handleSelectUser(user.id)}
                    />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                      {user.name ? user.name.split(" ").map(n => n[0]).join("").toUpperCase() : user.email[0].toUpperCase()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-sm sm:text-base">{user.name || "No name"}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground">{user.email}</div>
                      <div className="flex items-center gap-2 sm:hidden">
                        <Badge 
                          variant="outline"
                          className={cn(
                            "text-xs",
                            user.level_id === 2 && "text-purple-600 border-purple-600 bg-purple-50 dark:bg-purple-950/20",
                            user.level_id === 1 && "text-blue-600 border-blue-600 bg-blue-50 dark:bg-blue-950/20",
                          )}
                        >
                          {getUserType(user.level_id)}
                        </Badge>
                        <Badge 
                          variant="outline"
                          className={cn(
                            "text-xs",
                            user.subscription_tier === "Premium" ? "text-yellow-700 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-300" : ""
                          )}
                        >
                          {user.subscription_tier === "Premium" ? "Premium" : "Free"}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge 
                      variant="outline"
                      className={cn(
                        user.level_id === 2 && "text-purple-600 border-purple-600 bg-purple-50 dark:bg-purple-950/20",
                        user.level_id === 1 && "text-blue-600 border-blue-600 bg-blue-50 dark:bg-blue-950/20",
                      )}
                    >
                      {getUserType(user.level_id)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      className={cn(
                        "text-xs sm:text-sm",
                        user.status_users === "active" && "text-green-600 border-green-600 bg-green-50 dark:bg-green-950/20",
                        user.status_users === "pending" && "text-amber-600 border-amber-600 bg-amber-50 dark:bg-amber-950/20",
                        user.status_users === "inactive" && "text-red-600 border-red-600 bg-red-50 dark:bg-red-950/20",
                      )}
                    >
                      {user.status_users === "active" ? "Active" : 
                       user.status_users === "pending" ? "Pending" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge 
                      variant="outline"
                      className={user.email_verified
                        ? "text-green-600 border-green-600 bg-green-50 dark:bg-green-950/20"
                        : "text-amber-600 border-amber-600 bg-amber-50 dark:bg-amber-950/20"
                      }
                    >
                      {user.email_verified ? "Verified" : "Not Verified"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">
                      {user.subscription_tier === "Premium" ? "Premium" : "Free"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        
                        <DropdownMenuItem onClick={() => handleUpdateLevel(user.id, user.level_id === 1 ? 2 : 1)}>
                          <Shield className="mr-2 h-4 w-4" />
                          {user.level_id === 1 ? "Make Admin" : "Make User"}
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem onClick={() => handleUpdateStatus(user.id, "active")}>
                          <UserCog className="mr-2 h-4 w-4" />
                          Set Active
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem onClick={() => handleUpdateStatus(user.id, "pending")}>
                          <UserCog className="mr-2 h-4 w-4" />
                          Set Pending
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem onClick={() => handleUpdateStatus(user.id, "inactive")}>
                          <UserCog className="mr-2 h-4 w-4" />
                          Set Inactive
                        </DropdownMenuItem>
                        
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDeleteDialog(true);
                          }}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </Table>
        </div>
      </div>
      
      {/* Add User Dialog */}
      <Dialog open={showNewUserDialog} onOpenChange={setShowNewUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="level">User Level</Label>
              <Select
                value={String(newUser.level_id)}
                onValueChange={(value) => setNewUser({ ...newUser, level_id: Number(value) })}
              >
                <SelectTrigger id="level">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">User</SelectItem>
                  <SelectItem value="2">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={newUser.status_users}
                onValueChange={(value) => 
                  setNewUser({ ...newUser, status_users: value as "active" | "inactive" | "pending" })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="subscription_tier">Account Type</Label>
              <Select
                value={newUser.subscription_tier}
                onValueChange={(value) => 
                  setNewUser({ ...newUser, subscription_tier: value as "Free" | "Premium" })
                }
              >
                <SelectTrigger id="subscription_tier">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Free">Free</SelectItem>
                  <SelectItem value="Premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="email_verified" 
                checked={newUser.email_verified}
                onCheckedChange={(checked) => 
                  setNewUser({ ...newUser, email_verified: checked as boolean })
                }
              />
              <Label htmlFor="email_verified">Email verified</Label>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowNewUserDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              onClick={handleAddUser} 
              disabled={!newUser.name || !newUser.email}
            >
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user
              {selectedUser?.name && ` "${selectedUser.name}"`} and remove their data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
