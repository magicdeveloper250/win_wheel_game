import { useContext } from "react";
import NotificationContext from "../contexts/NotificationContext";
function useNotifications() {
  return useContext(NotificationContext);
}

export default useNotifications;
