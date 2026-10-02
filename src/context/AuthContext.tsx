"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface User {
  username: string;
  whatsapp?: string;
  activeCompanion: string;
  plan?: string;
  joinedAt?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password?: string) => Promise<boolean>;
  signup: (username: string, whatsapp: string, password?: string) => Promise<boolean>;
  logout: () => void;
  updateUserCompanion: (companionId: string, planName?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "thrivin_auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to read user from storage", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string): Promise<boolean> => {
    // Client-side authentication simulation
    const userData: User = {
      username: username.trim(),
      whatsapp: "081234567890",
      activeCompanion: "nina",
      plan: "Paket 3 Bulan (Quarter)",
      joinedAt: new Date().toLocaleDateString("id-ID", { month: "short", year: "numeric" }),
    };
    setUser(userData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    return true;
  };

  const signup = async (username: string, whatsapp: string): Promise<boolean> => {
    const userData: User = {
      username: username.trim(),
      whatsapp: whatsapp.trim(),
      activeCompanion: "nina",
      plan: "Pengguna Baru",
      joinedAt: new Date().toLocaleDateString("id-ID", { month: "short", year: "numeric" }),
    };
    setUser(userData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const updateUserCompanion = (companionId: string, planName?: string) => {
    if (!user) return;
    const updated: User = {
      ...user,
      activeCompanion: companionId,
      ...(planName ? { plan: planName } : {}),
    };
    setUser(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        signup,
        logout,
        updateUserCompanion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
