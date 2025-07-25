
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
import { UserPlus, MoreHorizontal, Trash2, UserCog, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useUsers, User } from "@/hooks/useUsers";

export default function AdminUsersPage() {
  const { users, isLoading, deleteUser, updateUserLevel, updateUserStatus, addUser } = useUsers();
  const [activeTab, setActiveTab] = useState<"all" | "active" | "pending" | "inactive">("all");
  
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    level_id: 1,
    status_users: "active" as "active" | "inactive" | "pending",
    email_verified: false,
    plan_type: "free" as "free" | "premium"
  });
  
  const filteredUsers = users.filter((user) => {
    if (activeTab === "all") return true;
    return user.status_users === activeTab;
  });
  
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
        plan_type: "free"
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

  const getUserType = (levelId: number | null) => {
    if (levelId === 2) return "Administrator";
    return "Investor";
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">User Management</h1>
        
        <Button onClick={() => setShowNewUserDialog(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add New User
        </Button>
      </div>
      
      <div className="flex space-x-4 mb-6">
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox className="ml-2" />
              </TableHead>
              <TableHead className="w-12"></TableHead>
              <TableHead>User</TableHead>
              <TableHead>User Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Email Verification</TableHead>
              <TableHead>Account Type</TableHead>
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
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell>
                    <div className="w-8 h-8 rounded-full bg-alphaquant-600 flex items-center justify-center text-white text-sm font-medium">
                      {user.name ? user.name.split(" ").map(n => n[0]).join("").toUpperCase() : user.email[0].toUpperCase()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{user.name || "No name"}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
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
                        user.status_users === "active" && "text-green-600 border-green-600 bg-green-50 dark:bg-green-950/20",
                        user.status_users === "pending" && "text-amber-600 border-amber-600 bg-amber-50 dark:bg-amber-950/20",
                        user.status_users === "inactive" && "text-red-600 border-red-600 bg-red-50 dark:bg-red-950/20",
                      )}
                    >
                      {user.status_users === "active" ? "Active" : 
                       user.status_users === "pending" ? "Pending" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
                    <Badge variant="outline">
                      {user.plan_type === "premium" ? "Premium" : "Free"}
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
              <Label htmlFor="plan_type">Account Type</Label>
              <Select
                value={newUser.plan_type}
                onValueChange={(value) => 
                  setNewUser({ ...newUser, plan_type: value as "free" | "premium" })
                }
              >
                <SelectTrigger id="plan_type">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
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
