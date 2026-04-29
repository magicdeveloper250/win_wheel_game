import SocketContext from "@/contexts/SocketContext";
import { useContext } from "react";
 
function useSocket() {
  return useContext(SocketContext);
}

export default useSocket;
