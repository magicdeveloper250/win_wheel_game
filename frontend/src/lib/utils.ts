import { isAxiosError } from "axios";
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export const errMsg = (error: unknown, fallback: string) =>
    isAxiosError(error) ? (error.response?.data?.error ?? error.message) : fallback;