import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import axios from 'axios';
import api from './api';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  contactType: string | null;
  approved: boolean;
  eulaAcceptedAt: string | null;
  docUploaded: boolean;
  isAdmin: boolean;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
  phone?: string;
  contactType: 'Buyer' | 'Buyer; Seller';
  address?: string;
  city?: string;
  postalCode?: string;
  mailingCountry?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isSignedIn: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  uploadAgreement: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const authApi = axios.create({ baseURL: '/api/auth', withCredentials: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshingRef = useRef<Promise<string | null> | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Attempt to refresh session on mount (httpOnly cookie)
  useEffect(() => {
    tryRefresh().finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function tryRefresh(): Promise<string | null> {
    // Mutex: prevent concurrent refresh calls
    if (refreshingRef.current) return refreshingRef.current;

    const promise = (async () => {
      try {
        const res = await authApi.post('/refresh');
        const { accessToken: newToken, user: newUser } = res.data;
        tokenRef.current = newToken;
        setAccessToken(newToken);
        setUser(newUser);
        return newToken as string;
      } catch {
        setAccessToken(null);
        setUser(null);
        return null;
      } finally {
        refreshingRef.current = null;
      }
    })();

    refreshingRef.current = promise;
    return promise;
  }

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.post('/login', { email, password });
    const { accessToken: newToken, user: newUser } = res.data;
    tokenRef.current = newToken;
    setAccessToken(newToken);
    setUser(newUser);
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const res = await authApi.post('/register', data);
    const { accessToken: newToken, user: newUser } = res.data;
    tokenRef.current = newToken;
    setAccessToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.post('/logout');
    } catch { /* ignore */ }
    tokenRef.current = null;
    setAccessToken(null);
    setUser(null);
  }, []);

  const uploadAgreement = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    await axios.post('/api/auth/upload-agreement', {}, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Refresh user status after upload
    await tryRefresh();
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshUser = useCallback(async () => {
    await tryRefresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep tokenRef in sync so the interceptor always reads the latest token
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  // Set up axios interceptor once on mount (reads token from ref, not closure)
  useEffect(() => {
    // Request interceptor: attach access token
    const reqInterceptor = api.interceptors.request.use(async (config: any) => {
      const token = tokenRef.current;
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor: handle 401 by refreshing
    const resInterceptor = api.interceptors.response.use(
      (res: any) => res,
      async (error: any) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const newToken = await tryRefresh();
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        }
        return Promise.reject(error);
      },
    );

    return () => {
      api.interceptors.request.eject(reqInterceptor);
      api.interceptors.response.eject(resInterceptor);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isSignedIn: !!user,
        isLoading,
        login,
        register,
        logout,
        uploadAgreement,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
