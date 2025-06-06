
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/services/api";
import { User } from "@/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "pending" | "inactive">("all");
  
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    level_id: 1,
    status: "active" as "active" | "inactive" | "pending",
    email_verified: false,
    account_type: "free" as "free" | "premium"
  });
  
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        const data = await api.users.getAllUsers();
        setUsers(data);
      } catch (error) {
        console.error("Failed to fetch users", error);
        toast.error("Failed to fetch users");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUsers();
  }, []);
  
  const filteredUsers = users.filter((user) => {
    if (activeTab === "all") return true;
    return user.status === activeTab;
  });
  
  const handleAddUser = async () => {
    try {
      setIsLoading(true);
      const createdUser = await api.users.create(newUser);
      
      // Map the database response to the User type
      const mappedUser: User = {
        id: createdUser.id,
        email: createdUser.email,
        full_name: createdUser.name || createdUser.email,
        level_id: createdUser.level_id || 1,
        status: createdUser.status_users === 'active' ? 'active' : 
                createdUser.status_users === 'inactive' ? 'inactive' : 
                createdUser.status_users === 'pending' ? 'pending' : 
                'active' as 'active' | 'pending' | 'inactive',
        email_verified: createdUser.email_verified || false,
        account_type: 'free',
        created_at: createdUser.created_at,
        last_login: createdUser.updated_at
      };
      
      setUsers([mappedUser, ...users]);
      setShowNewUserDialog(false);
      toast.success("User added successfully");
      
      // Reset form
      setNewUser({
        full_name: "",
        email: "",
        level_id: 1,
        status: "active",
        email_verified: false,
        account_type: "free"
      });
    } catch (error) {
      console.error("Failed to add user", error);
      toast.error("Failed to add user");
    } finally {
      setIsLoading(false);
    }
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
            {users.filter(user => user.status === "pending").length}
          </Badge>
        </Button>
        <Button
          variant={activeTab === "active" ? "default" : "outline"}
          onClick={() => setActiveTab("active")}
          className="relative"
        >
          Active
          <Badge variant="secondary" className="ml-2 bg-secondary">
            {users.filter(user => user.status === "active").length}
          </Badge>
        </Button>
        <Button
          variant={activeTab === "inactive" ? "default" : "outline"}
          onClick={() => setActiveTab("inactive")}
          className="relative"
        >
          Inactive
          <Badge variant="secondary" className="ml-2 bg-secondary">
            {users.filter(user => user.status === "inactive").length}
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
              <TableHead>Status</TableHead>
              <TableHead>Email Verification</TableHead>
              <TableHead>Account Type</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex items-center justify-center">
                    <div className="loading-circle" />
                    <span className="ml-3">Loading users...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                      {user.avatar_url || user.full_name.split(" ").map(n => n[0]).join("").toUpperCase()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{user.full_name}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      className={cn(
                        user.status === "active" && "text-green-600 border-green-600 bg-green-50 dark:bg-green-950/20",
                        user.status === "pending" && "text-amber-600 border-amber-600 bg-amber-50 dark:bg-amber-950/20",
                        user.status === "inactive" && "text-red-600 border-red-600 bg-red-50 dark:bg-red-950/20",
                      )}
                    >
                      {user.status === "active" ? "Active" : 
                       user.status === "pending" ? "Pending" : "Inactive"}
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
                      {user.email_verified ? "Verified" : "Ativo sem verificação"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {user.account_type === "premium" ? "Premium" : "Free"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.level_id === 2 ? "Admin" : "Investidor"}
                  </TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <span className="sr-only">Open menu</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
                        />
                      </svg>
                    </Button>
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
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
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
                  <SelectItem value="1">Investor</SelectItem>
                  <SelectItem value="2">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={newUser.status}
                onValueChange={(value) => 
                  setNewUser({ ...newUser, status: value as "active" | "inactive" | "pending" })
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
              <Label htmlFor="account_type">Account Type</Label>
              <Select
                value={newUser.account_type}
                onValueChange={(value) => 
                  setNewUser({ ...newUser, account_type: value as "free" | "premium" })
                }
              >
                <SelectTrigger id="account_type">
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
              disabled={!newUser.full_name || !newUser.email}
            >
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
