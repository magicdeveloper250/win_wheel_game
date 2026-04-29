import { unlockAudio, useSound } from "@/hooks/useSound";
import type { NotificationData } from "@/lib/types";
import { createContext, useState, useCallback, useEffect, useRef } from "react";
import type { PropsWithChildren } from "react";



interface NotificationContextType {
  notifications: NotificationData[];
  setNotifications: (data: NotificationData[] | ((prev: NotificationData[]) => NotificationData[])) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  setNotifications: () => {},
  clearNotifications: () => {},
});

export const NotificationProvider = ({ children }: PropsWithChildren<{}>) => {
  const [notifications, setNotificationsData] = useState<NotificationData[]>([]);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const { play: playNotificationSound } = useSound("/sounds/notify.wav", { volume: 0.8 });

  // Unlock AudioContext on first user gesture
  useEffect(() => {
    unlockAudio();
  }, []);

  // Play sound when new notifications arrive
  useEffect(() => {
    const prevIds = prevIdsRef.current;
    const hasNewNotification = notifications.some((n) => n?.id !== undefined && !prevIds.has(n.id));

    if (hasNewNotification) {
      playNotificationSound();
    }

    // Update tracked IDs
    prevIdsRef.current = new Set(notifications.filter(n => n.id != null).map((n) => n.id!));
  }, [notifications, playNotificationSound]);

  const clearNotifications = useCallback(() => {
    setNotificationsData([]);
    prevIdsRef.current = new Set();
  }, []);

  const setNotifications = useCallback(
    (data: NotificationData[] | ((prev: NotificationData[]) => NotificationData[])) => {
      setNotificationsData(data);
    },
    []
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        setNotifications,
        clearNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;