import { userAxios } from "@/lib/axios";
import useRefreshToken from "./useRefreshToken";
import { useEffect } from "react";
import useSession from "./useSession";
function useUserAxios() {
  const { session } = useSession();
  const refreshToken = useRefreshToken();
  useEffect(() => {
    const requestInterceptor = userAxios.interceptors.request.use(
      function (config: any) {
        if (!config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${session?.token}`;
        }
        return config;
      },
      function (error: any) {
        return Promise.reject(error);
      }
    );
    const responseInterceptor = userAxios.interceptors.response.use(
      (response: any) => response,
      async function (error: { config: any; response: { status: number; }; }) {
        const prevRequest = error.config;
        if (error?.response?.status === 401 && !prevRequest.sent) {
          prevRequest.sent = true;
          const newAccessToken = await refreshToken();
          prevRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
          return userAxios(prevRequest);
        }
        return Promise.reject(error);
      }
    );
    return () => {
      userAxios.interceptors.request.eject(requestInterceptor);
      userAxios.interceptors.response.eject(responseInterceptor);
    };
  }, [session]);
  return userAxios;
}

export default useUserAxios;
