import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Search,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Shield,
  Mail,
  Calendar,
  PhoneCall,
  Currency,
  List,
  Pencil,
  Trash,
  Loader2,
  ZodiacSagittariusIcon,
} from "lucide-react";

import useUserAxios from "@/hooks/useUserAxios";
import type { User } from "@/lib/types";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import UserMoneyDialog from "@/components/ui/UserMoneyDialog";
import useSession from "@/hooks/useSession";
import EditUserDialog from "@/components/ui/EditUserDialog";
import UserTransactionsDialog from "@/components/ui/UserTransactions";
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
import { isAxiosError } from "axios";

interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function UsersPage() {
  const axios = useUserAxios();
  const { session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [transactionsOpen, settransactionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const deleteUser = async () => {
    try {
      setDeletingUser(true);
      await axios.delete(`/auth/${currentUser?.id}`);
      toast.success("User account deleted successfully");
    } catch (err) {
      toast.error(
        isAxiosError(err)
          ? (err.response?.data?.error ?? err.message)
          : "User delete failed.",
      );
    } finally {
      fetchUsers();
      setDeletingUser(false);
    }
  };

  const fetchUsers = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const params: Record<string, string | number> = { page, limit };
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

        const resp = await axios.get<PaginatedUsers>("/auth", { params });

        setUsers(resp.data.data);
        setTotal(resp.data.total);
        setTotalPages(resp.data.totalPages);
      } catch {
        toast.error("Failed to fetch users");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [axios, page, limit, debouncedSearch],
  );

  const filteredUsers = users.filter((user) => {
    if (!debouncedSearch.trim()) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      user.name?.toLowerCase().includes(q) ||
      user.email?.toLowerCase().includes(q) ||
      user.role?.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!depositOpen) {
      setCurrentUser(null);
    }
  }, [depositOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Users</h1>
            <p className="text-sm text-muted-foreground">
              {total} total user{total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchUsers(true)}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Search Users</CardTitle>
          <CardDescription>Filter by name, email, or role</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-70">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" /> User
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      <PhoneCall className="h-4 w-4" /> Phone
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      <Currency className="h-4 w-4" /> Account Balance
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Role
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      <ZodiacSagittariusIcon className="h-4 w-4" /> Status
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Joined
                    </div>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-9 w-9 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-44" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Users className="h-10 w-10 opacity-30" />
                        <p className="font-medium">No users found</p>
                        {debouncedSearch && (
                          <p className="text-sm">Try a different search term</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-sm font-semibold text-primary">
                              {user.name.split(" ")[0].toUpperCase()[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium leading-none">{user.name ?? "—"}</p>
                            <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <a href={`tel:${user.phone}`} className="text-primary">{user.phone}</a>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{user.balance}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === "ADMIN" ? "default" : "secondary"} className="capitalize">
                          {user.role ?? "user"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "default" : "secondary"} className="capitalize">
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="sm" onClick={() => { setDepositOpen(true); setCurrentUser(user); }}>
                            Deposit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { settransactionsOpen(true); setCurrentUser(user); }}>
                            <List className="h-4 w-4" />
                            <span className="hidden lg:inline ml-1">Transactions</span>
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => { setEditOpen(true); setCurrentUser(user); }}>
                            <Pencil className="h-4 w-4" />
                            <span className="hidden lg:inline ml-1">Edit</span>
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => { setDeleteOpen(true); setCurrentUser(user); }}>
                            <Trash className="h-4 w-4" />
                            <span className="hidden lg:inline ml-1">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden divide-y">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-44" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-full" />
                </div>
              ))
            ) : filteredUsers.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Users className="h-10 w-10 opacity-30" />
                <p className="font-medium">No users found</p>
                {debouncedSearch && <p className="text-sm">Try a different search term</p>}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <div key={user.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-primary">
                          {user.name.split(" ")[0].toUpperCase()[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium leading-none">{user.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground mt-1">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={user.role === "ADMIN" ? "default" : "secondary"} className="capitalize text-xs">
                        {user.role ?? "user"}
                      </Badge>
                      <Badge variant={user.isActive ? "default" : "secondary"} className="capitalize text-xs">
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <a href={`tel:${user.phone}`} className="text-primary font-medium">{user.phone}</a>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="font-medium">{user.balance}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Joined</p>
                      <p className="font-medium">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" className="w-full" onClick={() => { setDepositOpen(true); setCurrentUser(user); }}>
                      Deposit
                    </Button>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => { settransactionsOpen(true); setCurrentUser(user); }}>
                      <List className="h-4 w-4 mr-1" /> Transactions
                    </Button>
                    <Button size="sm" variant="secondary" className="w-full" onClick={() => { setEditOpen(true); setCurrentUser(user); }}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="destructive" className="w-full" onClick={() => { setDeleteOpen(true); setCurrentUser(user); }}>
                      <Trash className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="gap-1"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <UserMoneyDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        action="deposit"
        userId={currentUser?.id}
        phoneNumber={session?.phone}
      />

      {currentUser && editOpen && (
        <EditUserDialog
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) fetchUsers();
          }}
          open={editOpen}
          user={currentUser}
        />
      )}

      {currentUser && transactionsOpen && (
        <UserTransactionsDialog
          onOpenChange={(open) => {
            settransactionsOpen(open);
            if (!open) fetchUsers();
          }}
          open={transactionsOpen}
          user={currentUser}
        />
      )}

      {currentUser && deleteOpen && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this account from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteUser()} disabled={deletingUser}>
                Continue {deletingUser && <Loader2 className="animate-spin" />}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default UsersPage;