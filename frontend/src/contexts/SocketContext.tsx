import { createContext, useState } from "react";
import type { PropsWithChildren } from "react";
import useSession from "@/hooks/useSession";

interface SocketData {
  [key: string]: any;
}

interface SocketContextType {
  newSocketData: SocketData[];
  setNewSocketData: (data: SocketData) => void;
  clearSocketData: () => void;
  connectWebSocket: (path: string) => WebSocket;
}

const SocketContext = createContext<SocketContextType>({
  newSocketData: [],
  setNewSocketData: () => {},
  clearSocketData: () => {},
  connectWebSocket: () => {
    throw new Error("connectWebSocket must be used within a SocketProvider");
  },
});

export const SocketProvider = ({ children }: PropsWithChildren<{}>) => {
  const [newSocketData, setSocketData] = useState<SocketData[]>([]);
  const{session}= useSession()
  const setNewSocketData = (data: SocketData) => {
    setSocketData((prev) => {
      const isDuplicate = prev.some(
        (msg) => JSON.stringify(msg) === JSON.stringify(data)
      );
      return isDuplicate ? prev : [...prev, data];
    });
  };

  const clearSocketData = () => {
    setSocketData([]);
  };

  const connectWebSocket = (path: string) => {
    

    const baseUrl = import.meta.env.VITE_WS_URL;
    const socketUrl = `${baseUrl}${path}${session?.token ? `?token=${session.token}` : ""}`;

    const ws = new WebSocket(socketUrl);
    return ws;
  }

  return (
    <SocketContext.Provider
      value={{
        newSocketData,
        setNewSocketData,
        clearSocketData,
        connectWebSocket,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;

