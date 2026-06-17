import { useState, useEffect, useCallback } from 'react';
import pb from '@/lib/pocketbase';
import type { RecordModel } from 'pocketbase';

export interface AuthState {
  user: RecordModel | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<RecordModel | null>(
    pb.authStore.isValid ? (pb.authStore.record as RecordModel) : null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if existing session is valid on mount
    if (pb.authStore.isValid) {
      setUser(pb.authStore.record as RecordModel);
    }
    setLoading(false);

    // Listen for auth store changes (e.g., token expiry)
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record as RecordModel | null);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const authData = await pb
      .collection('users')
      .authWithPassword(email, password);
    setUser(authData.record as RecordModel);
  }, []);

  const logout = useCallback(() => {
    pb.authStore.clear();
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: pb.authStore.isValid && user !== null,
    loading,
    login,
    logout,
  };
}
