import React, { createContext, useState, type ReactNode, } from "react";

// Define the context's value type
export interface ErrorContextType {
  error: string | null;
  setError: (error: string | null) => void;
}

// Create context with `undefined` as default to enable runtime safety
const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

// Props for the provider
interface ErrorContextProviderProps {
  children: ReactNode;
}

export const ErrorContextProvider: React.FC<ErrorContextProviderProps> = ({ children }) => {
  const [error, setError] = useState<string | null>(null);

  return (
    <ErrorContext.Provider value={{ error, setError }}>
      {children}
    </ErrorContext.Provider>
  );
};

export default ErrorContext;
