import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { GameSession, GameWinMultiplierSetting } from "@/lib/types"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { errMsg } from "@/lib/utils"
import useUserAxios from "@/hooks/useUserAxios"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  isEditing: boolean
  session?: GameSession
  open: boolean
  onOpenChange: () => void
  onSuccess:()=>void
}

export function CreateNewSessionWidget(props: Props) {
  const { isEditing, session, open, onOpenChange, onSuccess } = props
  const axios = useUserAxios()
  const [multipliers, setMultipliers] = useState<GameWinMultiplierSetting[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    duration: session?.duration ?? 0,
    shouldWin: session?.shouldWin ?? false,
    multiplier: null as GameWinMultiplierSetting | null,
  })

  useEffect(() => {
    if (isEditing && session) {
      setFormData({
        duration: session.duration,
        shouldWin: session.shouldWin,
        multiplier: null,
      })
    }
  }, [isEditing, session])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEditing && session) {
        await axios.patch(`/sessions/${session.id}`, {...formData, multiplier:formData.multiplier?.id})
        toast.success("Game session updated successfully")
      } else {
        await axios.post("/sessions", {...formData, multiplier:formData.multiplier?.id})
        toast.success("New game session created successfully")
      }
      onSuccess()
      onOpenChange()
    } catch (error) {
      toast.error(errMsg(error, isEditing ? "Failed to update game session." : "Failed to create game session."))
    } finally {
      setLoading(false)
    }
  }

  const fetchMultipliers = async () => {
    try {
      const resp = await axios.get("/multipliers")
      setMultipliers(
        resp.data.data.map((m: GameWinMultiplierSetting) => ({ ...m, pending: false }))
      )
    } catch (error) {
      toast.error(errMsg(error, "Failed to load multipliers."))
    }
  }

  useEffect(() => {
    fetchMultipliers()
  }, [])
useEffect(() => {
  if (multipliers.length === 0) return;

  if (isEditing && session) {
    const match = multipliers.find((m) => m.id === session.multiplier?.id) ?? multipliers[0];
    setFormData((prev) => ({ ...prev, multiplier: match }));
  } else {
    setFormData((prev) => ({ ...prev, multiplier: multipliers[0] }));
  }
}, [multipliers]);

useEffect(() => {
  if (isEditing && session) {
    const match = multipliers.find((m) => m.id === session.multiplier?.id) ?? multipliers[0] ?? null;
    setFormData({
      duration: session.duration,
      shouldWin: session.shouldWin,
      multiplier: match,
    });
  } else if (!isEditing) {
    setFormData({
      duration: 0,
      shouldWin: false,
      multiplier: multipliers[0] ?? null,
    });
  }
}, [isEditing, session]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {isEditing ? "Edit Session" : "Create New Session"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {isEditing
                ? "Update the game session settings below."
                : "Configure and launch a new game session."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="duration" className="text-foreground">
                Duration <span className="text-muted-foreground text-xs">(seconds)</span>
              </Label>
              <Input
                id="duration"
                type="number"
                min={0}
                value={formData.duration}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, duration: Number(e.target.value) }))
                }
                placeholder="e.g. 60"
                className="bg-background text-foreground border-border"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="multiplier" className="text-foreground">
            Max Win Multiplier
              </Label>
              <Select
                value={String(formData.multiplier?.id ?? "")}
                onValueChange={(val) => {
                  const selectedMultiplier =
                    multipliers.find((m) => String(m.id) === val) ?? null
                  setFormData((prev) => ({
                    ...prev,
                    multiplier: selectedMultiplier,
                  }))
                }}
              >
                <SelectTrigger
                  id="multiplier"
                  className="bg-background text-foreground border-border"
                >
                  <SelectValue placeholder="Select a multiplier" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground border-border">
                  {multipliers.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No multipliers available
                    </SelectItem>
                  ) : (
                    multipliers.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.winMultiplier}×
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="shouldWin" className="text-foreground text-sm leading-none">
                  Should Win
                </Label>
                <span className="text-muted-foreground text-xs">
                  Force a win outcome for this session
                </span>
              </div>
              <Switch
                id="shouldWin"
                checked={formData.shouldWin}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, shouldWin: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="border-border text-foreground">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                ? "Save Changes"
                : "Create Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}