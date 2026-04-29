import { createContext, useState, type ReactNode } from "react"
export interface Session {
  id: string
  email: string
  name: string
  phone: string
  role: string
  token: string
}
interface SessionProps {
  session?: Session
  setSession: (token?: Session | undefined) => void
}

const userSessionContext = createContext<SessionProps | undefined>(undefined)

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | undefined>(undefined)

  return (
    <userSessionContext.Provider value={{ session, setSession }}>
      {children}
    </userSessionContext.Provider>
  )
}

export default userSessionContext
