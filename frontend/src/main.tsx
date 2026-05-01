
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "./components/ui/sonner.tsx"
import { SessionProvider } from "./contexts/userSessionContext.tsx"
import { ErrorContextProvider } from "./contexts/ErrorContext.tsx"
import { SocketProvider } from "./contexts/SocketContext.tsx"
import { PermissionProvider } from "./contexts/PermissionContext.tsx"
import IsOnline from "./components/ui/IsOnline.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
        <SessionProvider>
          <PermissionProvider>
            <SocketProvider>
              <ErrorContextProvider>
                <div className="min-h-screen flex flex-col">
                  <IsOnline />
                <App />
                </div>
                <Toaster />
              </ErrorContextProvider>
            </SocketProvider>
          </PermissionProvider>
        </SessionProvider>
    </ThemeProvider>
  </StrictMode>
)
