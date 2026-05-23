"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import {
  QrCode, ScanLine, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import useUserAxios from "@/hooks/useUserAxios";
import jsQR from "jsqr";

type Bet = {
  targetNumber: string;
  multiplierNumber: number;
  amount: string;
};

type TicketResult = {
  id: string;
  name: string;
  phone: string | null;
  amount: string;
  paid: boolean;
  won: boolean;
  createdAt: string;
  sessionNumber: number | null;
  bets: Bet[];
};

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "loading" }
  | { status: "success"; ticket: TicketResult }
  | { status: "error"; message: string };

export default function VerifyTicketDialog() {
  const axios = useUserAxios();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      stopCamera();
      verifyTicket(code.data);
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setState({ status: "scanning" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch {
      setState({ status: "error", message: "Camera access denied." });
    }
  }, [tick]);

  const verifyTicket = useCallback(async (url: string) => {
    setState({ status: "loading" });
    try {
      const ticketId = url.split("/verify/")[1]?.split("?")[0];
      if (!ticketId) throw new Error("Invalid QR code.");
      const res = await axios.get(`/verify/${ticketId}`);
      setState({ status: "success", ticket: res.data });
    } catch (err) {
      const message = isAxiosError(err)
        ? (err.response?.data?.error ?? err.message)
        : "Verification failed.";
      setState({ status: "error", message });
      toast.error(message);
    }
  }, [axios]);

  const reset = useCallback(() => {
    stopCamera();
    setState({ status: "idle" });
  }, [stopCamera]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const fmt = (n: number) => n.toLocaleString("en-RW");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 py-0">
          <QrCode className="h-4 w-4" />
          Verify Ticket 
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden rounded-2xl border border-border">
        <div className="bg-primary px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-primary-foreground text-xl font-bold flex items-center gap-2">
              <ScanLine className="h-5 w-5 opacity-80" />
              Verify Ticket
            </DialogTitle>
            <p className="text-primary-foreground/60 text-sm mt-0.5">
              Scan the QR code on the bet slip.
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-4 bg-background">
          {state.status === "idle" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="rounded-full bg-muted p-6">
                <QrCode className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Point your camera at the QR code printed on the ticket slip.
              </p>
              <Button onClick={startCamera} className="w-full">
                <ScanLine className="mr-2 h-4 w-4" />
                Start Scanner
              </Button>
            </div>
          )}

          {state.status === "scanning" && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl bg-black aspect-square">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-52 h-52 relative">
                    <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                    <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                    <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                    <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />
                  </div>
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <p className="text-xs text-center text-muted-foreground">
                Align the QR code within the frame
              </p>
              <Button variant="outline" onClick={reset} className="w-full">
                Cancel
              </Button>
            </div>
          )}

          {state.status === "loading" && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verifying ticket…</p>
            </div>
          )}

          {state.status === "error" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-6">
                <XCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm font-medium text-destructive text-center">
                  {state.message}
                </p>
              </div>
              <Button onClick={startCamera} className="w-full">
                Try Again
              </Button>
            </div>
          )}

          {state.status === "success" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <span className="font-semibold text-sm">Ticket verified</span>
                <div className="ml-auto flex gap-1.5 shrink-0">
                  <Badge variant={state.ticket.paid ? "default" : "secondary"}>
                    {state.ticket.paid ? "Paid" : "Unpaid"}
                  </Badge>
                  <Badge variant={state.ticket.won ? "default" : "outline"}>
                    {state.ticket.won ? "Won" : "Pending"}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-2">
                {[
                  ["Holder", state.ticket.name],
                  ["Phone", state.ticket.phone ?? "—"],
                  ["Session", state.ticket.sessionNumber ? `#${state.ticket.sessionNumber}` : "—"],
                  ["Total Stake", `${fmt(Number(state.ticket.amount))} RWF`],
                  ["Placed", new Date(state.ticket.createdAt).toLocaleString("en-GB")],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right">{value}</span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Bets
                </p>
                {state.ticket.bets.map((bet, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm border border-border"
                  >
                    <span className="font-mono font-bold">{bet.targetNumber}</span>
                    <span className="text-muted-foreground text-xs">×{bet.multiplierNumber}</span>
                    <span className="font-medium">{fmt(Number(bet.amount))} RWF</span>
                  </div>
                ))}
              </div>

              <Button variant="outline" onClick={reset} className="w-full">
                Scan Another
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}