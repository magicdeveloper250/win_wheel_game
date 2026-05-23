import { Button } from "@/components/ui/button";
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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { GameSessionStatus, type GameSession } from "@/lib/types";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import useUserAxios from "@/hooks/useUserAxios";
import { CreateNewSessionWidget } from "@/components/widgets/CreateNewSessionWidget";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  GameSessionStatus,
  { label: string; dot: string; text: string; badge: string }
> = {
  [GameSessionStatus.ACTIVE]: {
    label: "Active",
    dot: "bg-green-500",
    text: "text-green-500",
    badge: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  [GameSessionStatus.UPCOMING]: {
    label: "Upcoming",
    dot: "bg-yellow-500",
    text: "text-yellow-500",
    badge: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  },
  [GameSessionStatus.COMPLETED]: {
    label: "Completed",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    badge: "bg-muted/40 text-muted-foreground border-border",
  },
  [GameSessionStatus.CANCELLED]: {
    label: "Cancelled",
    dot: "bg-destructive",
    text: "text-destructive",
    badge: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

const STATUS_LABELS: Record<GameSessionStatus, string> = {
  [GameSessionStatus.ACTIVE]: "Active",
  [GameSessionStatus.UPCOMING]: "Upcoming",
  [GameSessionStatus.COMPLETED]: "Completed",
  [GameSessionStatus.CANCELLED]: "Cancelled",
};


 

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i} className="border-border">
          {Array.from({ length: 6 }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full rounded" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function CardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
        >
          <div className="flex justify-between">
            <Skeleton className="h-3 w-16 rounded-full" />
            <Skeleton className="h-3 w-20 rounded-full" />
          </div>
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

function SessionCard({
  session,
  onEdit,
  onDelete,
  isDragging,
  dragHandleProps,
}: {
  session: GameSession;
  toggling: boolean;
  onToggleForceWin: (id: string, val: boolean) => void;
  onEdit: (session: GameSession) => void;
  onDelete: (session: GameSession) => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const cfg = STATUS_CONFIG[session.status];

  return (
    <div
      className={`
        rounded-xl border bg-card p-4 flex flex-col gap-3 transition-all
        ${isDragging ? "opacity-50 scale-95 shadow-xl border-primary/60" : ""}
        ${session.shouldWin ? "border-primary/50 shadow-sm shadow-primary/10" : "border-border"}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
          >
            <GripVertical size={14} />
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${cfg.dot} ${session.status === GameSessionStatus.ACTIVE ? "animate-pulse" : ""}`}
            />
            <span className={`text-xs font-bold tracking-widest uppercase ${cfg.text}`}>
              {cfg.label}
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(session.startedAt).toLocaleTimeString()} →{" "}
          {new Date(session.endedAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-bold text-foreground tracking-wide text-sm">
            SID-{session.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {session.status === GameSessionStatus.UPCOMING
              ? "Waiting for players…"
              : `Started ${new Date(session.startedAt).toLocaleTimeString()}`}
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {session.multiplier?.multiplierLetter.toUpperCase()}{" "}
          {session.multiplier?.winMultiplier}x
        </div>
      </div>

      {session.shouldWin && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
          <span className="text-primary text-xs">ℹ</span>
          <span className="text-xs text-primary font-medium">
            RNG Override Active: Session {session.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => onEdit(session)}
        >
          <Pencil size={12} /> Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => onDelete(session)}
        >
          <Trash2 size={12} /> Delete
        </Button>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap
        ${
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
        }
      `}
    >
      {label}
    </button>
  );
}

function DraggableTableRow({
  session,
  index,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDelete,
  isDragOver,
  isDragging,
}: {
  session: GameSession;
  index: number;
  toggling: boolean;
  onToggleForceWin: (id: string, val: boolean) => void;
  onEdit: (session: GameSession) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
  onDelete: (session: GameSession) => void;
}) {
  const cfg = STATUS_CONFIG[session.status];

  return (
    <TableRow
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
      className={`border-border transition-all duration-150 ${
        isDragging
          ? "opacity-40"
          : isDragOver
            ? "border-t-2 border-t-primary bg-primary/5"
            : session.shouldWin
              ? "bg-primary/5 hover:bg-primary/10"
              : "hover:bg-muted/30"
      }`}
    >
      <TableCell className="w-8 pr-0">
        <div className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors flex justify-center">
          <GripVertical size={15} />
        </div>
      </TableCell>
      <TableCell className="text-sm font-semibold text-foreground">
        {session.id.toUpperCase()}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {session.sessionNumber}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {session.multiplier?.multiplierLetter.toUpperCase()}{" "}
        {session.multiplier?.winMultiplier} X
      </TableCell>
      <TableCell>
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(session)}
          >
            <Pencil size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(session)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SessionsPage() {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [savingOrder, setSavingOrder] = useState(false);
  const axios = useUserAxios();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GameSessionStatus | "ALL">("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<GameSession | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<GameSession | undefined>(undefined);

  const openCreate = () => {
    setEditingSession(undefined);
    setDialogOpen(true);
  };

  const openEdit = (session: GameSession) => {
    setEditingSession(session);
    setDialogOpen(true);
  };

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const mobileDragIndexRef = useRef<number | null>(null);
  const [mobileDragOver, setMobileDragOver] = useState<number | null>(null);
  const [mobileDragging, setMobileDragging] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
    setDraggingIndex(index);
  };

  const openDeleteDialog = (session: GameSession) => {
    setSessionToDelete(session);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!sessionToDelete) return;
    setDeletingId(sessionToDelete.id);
    try {
      await axios.delete(`/sessions/${sessionToDelete.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete.id));
      setPagination((p) => ({ ...p, total: p.total - 1 }));
      toast.success("Session deleted.");
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data?.error ?? err.message)
        : "Failed to delete session.";
      toast.error(msg);
    } finally {
      setDeletingId(null);
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndexRef.current === null) return;
    setDragOverIndex(index);
  };

  const handleDrop = (dropIndex: number) => {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;
    const reordered = [...sessions];
    const [removed] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, removed);
    setSessions(reordered);
    persistOrder(reordered);
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setDraggingIndex(null);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setDraggingIndex(null);
  };

  const handleMobileDragStart = (index: number) => {
    mobileDragIndexRef.current = index;
    setMobileDragging(index);
  };

  const handleMobileDrop = (dropIndex: number) => {
    const dragIndex = mobileDragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;
    const reordered = [...sessions];
    const [removed] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, removed);
    setSessions(reordered);
    persistOrder(reordered);
    mobileDragIndexRef.current = null;
    setMobileDragOver(null);
    setMobileDragging(null);
  };

  const persistOrder = async (ordered: GameSession[]) => {
    setSavingOrder(true);
    try {
      await axios.patch("/sessions/reorder", {
        ids: ordered.map((s, i) => ({ id: s.id, sessionNumber: i + 1 })),
      });
      toast.success("Session order saved.");
    } catch {
      toast.error("Failed to save order. Please retry.");
    } finally {
      setSavingOrder(false);
    }
  };

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination((p) => ({ ...p, page: 1 }));
    }, 400);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search]);

  const patchForceWin = async (id: string, val: boolean) => {
    const response = await axios.patch(`/sessions/${id}`, { shouldWin: val });
    return response.data;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await axios.get("/sessions", {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          search: debouncedSearch || undefined,
        },
      });
      setSessions(result.data.data);
      setPagination(result.data.pagination);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data?.error ?? err.message)
        : "Failed to load sessions.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, statusFilter, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleForceWin = async (id: string, val: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, shouldWin: val } : s)),
    );
    try {
      await patchForceWin(id, val);
      toast.success(val ? "Force Win enabled." : "Force Win disabled.");
    } catch (err) {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, shouldWin: !val } : s)),
      );
      const msg = isAxiosError(err)
        ? (err.response?.data?.error ?? err.message)
        : "Failed to update session.";
      toast.error(msg);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  if (error && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-6">
        <p className="text-sm text-destructive font-medium">{error}</p>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw size={13} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <CreateNewSessionWidget
        isEditing={!!editingSession}
        session={editingSession}
        open={dialogOpen}
        onOpenChange={() => setDialogOpen(false)}
        onSuccess={load}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">
                {sessionToDelete?.id.toUpperCase()}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? <Loader2 size={14} className="animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-4 p-4 md:p-6 min-h-full bg-background">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-bold text-foreground tracking-tight truncate">
              Game Sessions
            </h1>
            {savingOrder && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Loader2 size={12} className="animate-spin" />
                <span className="hidden sm:inline">Saving order…</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
              {pagination.total} sessions
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={load}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </Button>
            <Button className="cursor-pointer hover:opacity-80 gap-1" onClick={openCreate}>
              <Plus size={15} />
              <span className="hidden sm:inline">New Session</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                type="search"
                placeholder="Search session ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm bg-card border-border"
              />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <FilterPill
              label="All"
              active={statusFilter === "ALL"}
              onClick={() => {
                setStatusFilter("ALL");
                setPagination((p) => ({ ...p, page: 1 }));
              }}
            />
            {Object.values(GameSessionStatus).map((status) => (
              <FilterPill
                key={status}
                label={STATUS_LABELS[status]}
                active={statusFilter === status}
                onClick={() => {
                  setStatusFilter(status);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            ))}
          </div>

          {sessions.length > 1 && !loading && (
            <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
              <GripVertical size={11} />
              Drag rows to reorder sessions
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 md:hidden">
          {loading ? (
            <CardSkeleton />
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No sessions found.
            </div>
          ) : (
            sessions.map((session, index) => (
              <div
                key={session.id}
                draggable
                onDragStart={() => handleMobileDragStart(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setMobileDragOver(index);
                }}
                onDrop={() => handleMobileDrop(index)}
                onDragEnd={() => {
                  mobileDragIndexRef.current = null;
                  setMobileDragOver(null);
                  setMobileDragging(null);
                }}
                className={`transition-all duration-150 ${
                  mobileDragOver === index && mobileDragging !== index
                    ? "border-t-2 border-primary"
                    : ""
                }`}
              >
                <SessionCard
                  session={session}
                  toggling={togglingIds.has(session.id)}
                  onToggleForceWin={handleToggleForceWin}
                  onEdit={openEdit}
                  onDelete={openDeleteDialog}
                  isDragging={mobileDragging === index}
                  dragHandleProps={{
                    onMouseDown: () => handleMobileDragStart(index),
                  }}
                />
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 border-border">
                <TableHead className="w-8" />
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Session ID
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Session Number
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Max Multiplier
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton />
              ) : sessions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    No sessions found.
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session, index) => (
                  <DraggableTableRow
                    key={session.id}
                    session={session}
                    index={index}
                    toggling={togglingIds.has(session.id)}
                    onToggleForceWin={handleToggleForceWin}
                    onEdit={openEdit}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onDelete={openDeleteDialog}
                    isDragOver={dragOverIndex === index && draggingIndex !== index}
                    isDragging={draggingIndex === index}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-1 gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Page {pagination.page} of {totalPages} · {pagination.total} total
            </span>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-border text-muted-foreground hover:text-foreground"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              >
                <ChevronLeft size={14} />
              </Button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={p === pagination.page ? "default" : "ghost"}
                  size="icon"
                  className="h-8 w-8 text-xs"
                  disabled={loading}
                  onClick={() => setPagination((prev) => ({ ...prev, page: p }))}
                >
                  {p}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-border text-muted-foreground hover:text-foreground"
                disabled={pagination.page >= totalPages || loading}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default SessionsPage;