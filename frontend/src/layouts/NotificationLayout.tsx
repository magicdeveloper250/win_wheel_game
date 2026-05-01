import { useEffect, useRef } from "react";
import { Outlet } from "react-router";
import { toast } from "sonner";
import { useLiveGameWs } from "@/hooks/useLiveGameWs";

function NotificationLayout() {
  const { latestEvent, connected, reconnecting, reconnectAttempt } = useLiveGameWs();
  const hasConnectedOnce = useRef(false);
  const disconnectToastId = useRef<string | number | null>(null);

  useEffect(() => {
    if (connected) {
      if (disconnectToastId.current) {
        toast.dismiss(disconnectToastId.current);
        disconnectToastId.current = null;
      }
      if (hasConnectedOnce.current) {
        toast.success("Live stream reconnected.", {
          duration: 2500,
          position: "top-right",
        });
      }
      hasConnectedOnce.current = true;
      return;
    }

    if (reconnecting && disconnectToastId.current === null) {
      const suffix = reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt})` : "";
      disconnectToastId.current = toast.warning(
        `Live stream disconnected. Reconnecting...${suffix}`,
        {
          duration: Infinity,
          position: "top-right",
        },
      );
    }
  }, [connected, reconnecting, reconnectAttempt]);

  useEffect(() => {
    if (!latestEvent) return;

    switch (latestEvent.type) {
      case "session_opened":
        toast.info(`Session #${latestEvent.sessionNumber} opened - place your bets!`, {
          duration: 4000,
          position: "top-right",
        });
        break;

      case "betting_countdown":
        if (latestEvent.secondsLeft === 10) {
          toast.warning("10 seconds left!", {
            duration: 3000,
            position: "top-right",
          });
        } else if (latestEvent.secondsLeft === 0) {
          toast.info("Bets are now closed.", { duration: 2000, position: "top-right" });
        }
        break;

      case "bets_locked":
        break;

      case "spin_result":
        toast.success("Wheel spinning - good luck!", {
          duration: 3000,
          position: "top-right",
        });
        break;

      case "round_ended":
        toast.info(`Round ended - winning number: ${latestEvent.winNumber}`, {
          duration: 5000,
          position: "top-right",
        });
        break;
    }
  }, [latestEvent]);

  return <Outlet />;
}

export default NotificationLayout;
