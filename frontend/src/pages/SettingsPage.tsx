import { useEffect, useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  GameTargetNumberSetting,
  GameWinMultiplierSetting,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  TimerReset,
  X,
} from "lucide-react";
import useUserAxios from "@/hooks/useUserAxios";
import { toast } from "sonner";
import { errMsg } from "@/lib/utils";
interface OptimisticGameTargetNumberSetting extends GameTargetNumberSetting {
  pending: boolean;
}

interface OptimisticGameWinMultiplierSetting extends GameWinMultiplierSetting {
  pending: boolean;
}

const COLOR_OPTIONS: { label: string; hex: string; value: string }[] = [
  { label: "Red", hex: "#4A0202", value: "0xef4444" },
  { label: "White", hex: "#ffffff", value: "0xffffff" },
  { label: "Rose", hex: "#E9072C", value: "0xf43f5e" },
  { label: "Orange", hex: "#f97316", value: "0xf97316" },
  { label: "Amber", hex: "#f59e0b", value: "0xf59e0b" },
  { label: "Yellow", hex: "#eab308", value: "0xeab308" },
  { label: "Gold", hex: "#FFD700", value: "0xFFD700" },
  { label: "Lime", hex: "#84cc16", value: "0x84cc16" },
  { label: "Green", hex: "#22c55e", value: "0x22c55e" },
  { label: "Cyan", hex: "#06b6d4", value: "0x06b6d4" },
  { label: "Blue", hex: "#3b82f6", value: "0x3b82f6" },
  { label: "Violet", hex: "#000000", value: "0x000000" },
  { label: "Pink", hex: "#ec4899", value: "0xec4899" },
];

const hexToValue = (hex: string) => `0x${hex.replace("#", "").toLowerCase()}`;

const valueToHex = (value: string) => `#${value.replace(/^0x/, "")}`;

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const isCustom = !COLOR_OPTIONS.some((c) => c.value === value);
  const currentHex = valueToHex(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {COLOR_OPTIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onChange(c.value)}
            className={`w-6 h-6 rounded-full border-2 transition-all shrink-0
              ${
                value === c.value
                  ? "border-primary scale-110 shadow-sm shadow-primary/30"
                  : "border-transparent hover:border-border hover:scale-105"
              }
              ${c.hex === "#ffffff" ? "ring-1 ring-border" : ""}
            `}
            style={{ backgroundColor: c.hex }}
          />
        ))}

        <label
          title="Custom color"
          className={`w-6 h-6 rounded-full border-2 cursor-pointer overflow-hidden transition-all shrink-0
            ${isCustom ? "border-primary scale-110" : "border-border hover:scale-105"}
          `}
          style={{ backgroundColor: isCustom ? currentHex : "#888888" }}
        >
          <input
            type="color"
            className="opacity-0 w-0 h-0 absolute"
            value={isCustom ? currentHex : "#888888"}
            onChange={(e) => onChange(hexToValue(e.target.value))}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="w-5 h-5 rounded border border-border shrink-0"
          style={{ backgroundColor: currentHex }}
        />
        <span className="text-xs text-muted-foreground  ">{value}</span>
      </div>
    </div>
  );
}

function SettingsPage() {
  const axios = useUserAxios();

  const [targetNumbers, setTargetNumbers] = useState<
    OptimisticGameTargetNumberSetting[]
  >([]);
  const [multipliers, setMultipliers] = useState<
    OptimisticGameWinMultiplierSetting[]
  >([]);

  const [targetNumberForm, setTargetNumberForm] = useState({
    number: "",
    color: "0xef4444",
  });
  const [multiplierForm, setMultiplierForm] = useState({
    label: "",
    value: "",
    color: "0xef4444",
  });

  const [editingTargetNumber, setEditingTargetNumber] =
    useState<OptimisticGameTargetNumberSetting | null>(null);
  const [editingMultiplier, setEditingMultiplier] =
    useState<OptimisticGameWinMultiplierSetting | null>(null);

  const [targetNumberPending, setTargetNumberPending] = useState(false);
  const [multiplierPending, setMultiplierPending] = useState(false);

  const fetchTargetNumbers = async () => {
    try {
      const resp = await axios.get("/numbers");
      setTargetNumbers(
        resp.data.data.map(
          (n: GameTargetNumberSetting & { color?: string }) => ({
            ...n,
            color: n.color ?? "0xffffff",
            pending: false,
          }),
        ),
      );
    } catch (error) {
      toast.error(errMsg(error, "Failed to load target numbers."));
    }
  };

  const fetchMultipliers = async () => {
    try {
      const resp = await axios.get("/multipliers");
      setMultipliers(
        resp.data.data.map((m: GameWinMultiplierSetting) => ({
          ...m,
          pending: false,
        })),
      );
    } catch (error) {
      toast.error(errMsg(error, "Failed to load multipliers."));
    }
  };

  useEffect(() => {
    fetchTargetNumbers();
    fetchMultipliers();
  }, []);

  const handleSubmitTargetNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(targetNumberForm.number);
    if (targetNumberForm.number === "" || isNaN(num) || num < 0 || num > 36) {
      toast.error("Enter a valid number between 0 and 36.");
      return;
    }
    const tempId = `temp-${Date.now()}`;
    setTargetNumbers((prev) => [
      ...prev,
      {
        id: tempId,
        targetNumber: num,
        color: targetNumberForm.color,
        createdAt: "",
        updatedAt: "",
        pending: true,
      },
    ]);
    setTargetNumberForm({ number: "", color: "0xef4444" });
    setTargetNumberPending(true);
    try {
      await axios.post("/numbers", {
        number: num,
        color: targetNumberForm.color,
      });
      toast.success("Target number added.");
      await fetchTargetNumbers();
    } catch (error) {
      setTargetNumbers((prev) => prev.filter((n) => n.id !== tempId));
      toast.error(errMsg(error, "Failed to add target number."));
    } finally {
      setTargetNumberPending(false);
    }
  };

  const handleEditTargetNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTargetNumber) return;
    setTargetNumbers((prev) =>
      prev.map((n) =>
        n.id === editingTargetNumber.id ? { ...n, pending: true } : n,
      ),
    );
    setTargetNumberPending(true);
    try {
      await axios.patch(`/numbers/${editingTargetNumber.id}`, {
        color: targetNumberForm.color,
      });
      toast.success("Target number updated.");
      setEditingTargetNumber(null);
      setTargetNumberForm({ number: "", color: "0xef4444" });
      await fetchTargetNumbers();
    } catch (error) {
      setTargetNumbers((prev) =>
        prev.map((n) =>
          n.id === editingTargetNumber.id ? { ...n, pending: false } : n,
        ),
      );
      toast.error(errMsg(error, "Failed to update target number."));
    } finally {
      setTargetNumberPending(false);
    }
  };

  const handleRemoveTargetNumber = async (id: string) => {
    setTargetNumbers((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pending: true } : n)),
    );
    try {
      await axios.delete(`/numbers/${id}`);
      setTargetNumbers((prev) => prev.filter((n) => n.id !== id));
      toast.success("Target number removed.");
    } catch (error) {
      setTargetNumbers((prev) =>
        prev.map((n) => (n.id === id ? { ...n, pending: false } : n)),
      );
      toast.error(errMsg(error, "Failed to remove target number."));
    }
  };

  const startEditingTargetNumber = (n: OptimisticGameTargetNumberSetting) => {
    setEditingTargetNumber(n);
    setTargetNumberForm({ number: String(n.targetNumber), color: n.color });
  };

  const cancelEditingTargetNumber = () => {
    setEditingTargetNumber(null);
    setTargetNumberForm({ number: "", color: "0xef4444" });
  };

  const handleSubmitMultiplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!multiplierForm.label.trim() || !multiplierForm.value) {
      toast.error("Fill in both label and value.");
      return;
    }
    setMultiplierPending(true);
    try {
      await axios.post("/multipliers", {
        label: multiplierForm.label.trim(),
        value: Number(multiplierForm.value),
        color: multiplierForm.color,
      });
      toast.success("Multiplier added.");
      setMultiplierForm({ label: "", value: "", color: "0xef4444" });
      await fetchMultipliers();
    } catch (error) {
      toast.error(errMsg(error, "Failed to add multiplier."));
    } finally {
      setMultiplierPending(false);
    }
  };

  const handleEditMultiplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMultiplier) return;
    if (!multiplierForm.label.trim() || !multiplierForm.value) {
      toast.error("Fill in both label and value.");
      return;
    }
    setMultiplierPending(true);
    setMultipliers((prev) =>
      prev.map((m) =>
        m.id === editingMultiplier.id ? { ...m, pending: true } : m,
      ),
    );
    try {
      await axios.patch(`/multipliers/${editingMultiplier.id}`, {
        label: multiplierForm.label.trim(),
        value: Number(multiplierForm.value),
        color: multiplierForm.color,
      });
      toast.success("Multiplier updated.");
      setEditingMultiplier(null);
      setMultiplierForm({ label: "", value: "", color: "0xef4444" });
      await fetchMultipliers();
    } catch (error) {
      setMultipliers((prev) =>
        prev.map((m) =>
          m.id === editingMultiplier.id ? { ...m, pending: false } : m,
        ),
      );
      toast.error(errMsg(error, "Failed to update multiplier."));
    } finally {
      setMultiplierPending(false);
    }
  };

  const handleRemoveMultiplier = async (id: string) => {
    setMultipliers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, pending: true } : m)),
    );
    try {
      await axios.delete(`/multipliers/${id}`);
      setMultipliers((prev) => prev.filter((m) => m.id !== id));
      toast.success("Multiplier removed.");
    } catch (error) {
      setMultipliers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, pending: false } : m)),
      );
      toast.error(errMsg(error, "Failed to remove multiplier."));
    }
  };

  const startEditing = (m: OptimisticGameWinMultiplierSetting) => {
    setEditingMultiplier(m);
    setMultiplierForm({
      label: m.multiplierLetter,
      value: String(m.winMultiplier),
      color: String(m.color),
    });
  };

  const cancelEditing = () => {
    setEditingMultiplier(null);
    setMultiplierForm({ label: "", value: "", color: "0xef4444" });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Game Configuration Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage game logic parameters for realtime wheel distribution.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            <div className="flex items-center gap-2">
              <LayoutDashboard size={18} /> Target Numbers
            </div>
          </CardTitle>
          <CardAction>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {targetNumbers.length} numbers
            </span>
          </CardAction>
        </CardHeader>

        <CardContent>
          {targetNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No target numbers configured.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {targetNumbers.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm   font-semibold transition-all
                    ${n.pending ? "opacity-50 pointer-events-none" : ""}
                    ${editingTargetNumber?.id === n.id ? "border-primary/50 bg-primary/5" : "border-border bg-muted"}
                  `}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                    style={{ backgroundColor: valueToHex(n.color) }}
                  />
                  <span className="text-foreground">{n.targetNumber}</span>
                  {n.pending ? (
                    <Loader2
                      size={12}
                      className="animate-spin text-muted-foreground"
                    />
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => startEditingTargetNumber(n)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleRemoveTargetNumber(n.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>

        <CardFooter>
          <form
            onSubmit={
              editingTargetNumber
                ? handleEditTargetNumber
                : handleSubmitTargetNumber
            }
            className="w-full"
          >
            <div className="flex flex-col gap-3">
              {!editingTargetNumber && (
                <Input
                  type="number"
                  min={0}
                  max={36}
                  placeholder="Enter number 0–36"
                  value={targetNumberForm.number}
                  onChange={(e) =>
                    setTargetNumberForm((f) => ({
                      ...f,
                      number: e.target.value,
                    }))
                  }
                  className="h-9 text-sm bg-background border-border"
                />
              )}

              {editingTargetNumber && (
                <p className="text-xs text-muted-foreground">
                  Editing{" "}
                  <span className="  font-semibold text-foreground">
                    {editingTargetNumber.targetNumber}
                  </span>{" "}
                  — pick a new color:
                </p>
              )}

              <ColorPicker
                value={targetNumberForm.color}
                onChange={(v) =>
                  setTargetNumberForm((f) => ({ ...f, color: v }))
                }
              />

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={targetNumberPending}
                  className="flex-1"
                >
                  {targetNumberPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : editingTargetNumber ? (
                    <Pencil size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                  {editingTargetNumber ? "Save Color" : "Add Number"}
                </Button>
                {editingTargetNumber && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelEditingTargetNumber}
                    className="border-border"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            <div className="flex items-center gap-2">
              <TimerReset size={18} /> Multipliers
            </div>
          </CardTitle>
          <CardAction>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {multipliers.length} multipliers
            </span>
          </CardAction>
        </CardHeader>

        <CardContent>
          {multipliers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No multipliers configured.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {multipliers.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border transition-opacity
                    ${m.pending ? "opacity-50 pointer-events-none" : ""}
                    ${editingMultiplier?.id === m.id ? "border-primary/50 bg-primary/5" : "border-border bg-muted"}
                  `}
                >
                  {" "}
                  <div
                    className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                    style={{
                      backgroundColor: valueToHex(m?.color ?? "0xef4444"),
                    }}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-foreground uppercase truncate">
                      {m.multiplierLetter}
                    </span>
                    <span className="text-xs text-muted-foreground  ">
                      ×{m.winMultiplier}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.pending ? (
                      <Loader2
                        size={13}
                        className="animate-spin text-muted-foreground"
                      />
                    ) : (
                      <>
                        <button
                          onClick={() => startEditing(m)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleRemoveMultiplier(m.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                        >
                          <X size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        <CardFooter>
          <form
            onSubmit={
              editingMultiplier ? handleEditMultiplier : handleSubmitMultiplier
            }
            className="w-full"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Label (e.g. A)"
                  value={multiplierForm.label}
                  maxLength={1}
                  onChange={(e) =>
                    setMultiplierForm((f) => ({ ...f, label: e.target.value }))
                  }
                  className="h-9 text-sm bg-background border-border"
                />
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Value (e.g. 2.5)"
                  value={multiplierForm.value}
                  onChange={(e) =>
                    setMultiplierForm((f) => ({ ...f, value: e.target.value }))
                  }
                  className="h-9 text-sm bg-background border-border"
                />
              </div>
              {editingMultiplier && (
                <p className="text-xs text-muted-foreground">
                  Editing{" "}
                  <span className="  font-semibold text-foreground">
                    {editingMultiplier.multiplierLetter}
                  </span>{" "}
                  — pick a new color:
                </p>
              )}

              <ColorPicker
                value={multiplierForm.color}
                onChange={(v) => setMultiplierForm((f) => ({ ...f, color: v }))}
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={multiplierPending}
                  className="flex-1"
                >
                  {multiplierPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : editingMultiplier ? (
                    <Pencil size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                  {editingMultiplier ? "Save Changes" : "Add Multiplier"}
                </Button>
                {editingMultiplier && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelEditing}
                    className="border-border"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}

export default SettingsPage;
