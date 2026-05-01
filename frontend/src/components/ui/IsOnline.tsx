import { useSyncExternalStore } from "react";

function IsOnline() {
  const isOnline = useSyncExternalStore(subscribe, () => navigator.onLine);

  return !isOnline ? (
    <div className="w-full h-12 bg-red-900 flex items-center justify-center z-50">
      <span className="text-white font-bold">You are offline</span>
    </div>
  ) : null;
}

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export default IsOnline;
