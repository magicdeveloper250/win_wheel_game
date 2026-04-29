import { useEffect } from "react";
import { Outlet } from "react-router";
import useSocket from "../hooks/useSockets";
import useNotifications from "../hooks/useNotifications";
// import useUserAxios from "../hooks/useUserAxios";
import { toast } from "sonner";
import type { NotificationData} from "@/lib/types";
function NotificationLayout() {
  const {connectWebSocket} = useSocket();
  const{setNotifications}= useNotifications()
  // const axios= useUserAxios()

  //   const fetchNotifications = async () => {
  //   try {
  //     const response = await axios.get("/notifications/unread/");
  //     setNotifications(response.data);
      
  //   } catch (error) {
  //     console.error("Error fetching notifications:", error);
  //   }
  // };
  

  useEffect(() => {
    const socket=connectWebSocket("/");
    socket.onmessage = (event: MessageEvent) => {
      try {
        const notification: NotificationData = JSON.parse(event.data);
        
        if (notification.message) {
           toast.info(notification.message || "New message received")
               setNotifications((prevNotifications: NotificationData[]) => [
            ...prevNotifications,
            notification
          ]);

        }
      } catch (e) {
        console.log(e)
         toast.error("Invalid notification")
      }
    };

    return () => {
      socket?.close();  
    };
  }, []);
  //  useEffect(() => {
  //   fetchNotifications();
  // }, []);

  return <Outlet />;
}

export default NotificationLayout;
