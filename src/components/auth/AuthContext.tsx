'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAuth, onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { app, db } from '@/lib/firebase/client';
import AuthModal from './AuthModal';
import { canAccessVisibility as canAccessVisibilityForProfile, hasPermission as profileHasPermission } from '@/lib/auth/permissions';
import type { ContentVisibility } from '@/types/content';
import type { AdminPermission } from '@/types/permissions';
import type { AccountStatus, PortalMode, UserProfile } from '@/types/users';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  portalMode: PortalMode;
  accountStatus: AccountStatus | null;
  permissions: AdminPermission[];
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (permission: AdminPermission) => boolean;
  canAccessVisibility: (visibility: ContentVisibility) => boolean;
  isAdmin: boolean;
  isModerator: boolean;
  showAuthModal: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  portalMode: 'guest',
  accountStatus: null,
  permissions: [],
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
  hasPermission: () => false,
  canAccessVisibility: (visibility) => visibility === 'public',
  isAdmin: false,
  isModerator: false,
  showAuthModal: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const openAuthModal = () => setShowAuthModal(true);
  const closeAuthModal = () => setShowAuthModal(false);

  const loginWithEmail = async (email: string, password: string) => {
    const auth = getAuth(app);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const registerWithEmail = async (email: string, password: string) => {
    const auth = getAuth(app);
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const refreshProfileForUser = async (targetUser: User | null) => {
    if (!targetUser) {
      setProfile(null);
      return;
    }

    const snapshot = await getDoc(doc(db, 'users', targetUser.uid));
    setProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
  };

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setUser(user);
      if (user) {
        try {
          const idToken = await user.getIdToken();
          const idTokenResult = await user.getIdTokenResult();
          setIsAdmin(!!idTokenResult.claims.admin);
          setIsModerator(!!idTokenResult.claims.moderator);

          const response = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });

          if (response.ok) {
            const data = (await response.json()) as { profile?: UserProfile };
            setProfile(data.profile ?? null);
          } else {
            await refreshProfileForUser(user);
          }
        } catch (error) {
          console.error('Profile refresh failed:', error);
          await refreshProfileForUser(user).catch(() => setProfile(null));
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsModerator(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = async () => {
    const auth = getAuth(app);
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    await signOut(auth);
  };

  const permissions = useMemo(() => profile?.adminPermissions ?? [], [profile]);
  const portalMode = profile?.portalMode ?? 'guest';
  const accountStatus = profile?.accountStatus ?? null;

  const refreshProfile = async () => {
    await refreshProfileForUser(user);
  };

  const hasPermission = (permission: AdminPermission) => profileHasPermission(profile, permission);
  const canAccessVisibility = (visibility: ContentVisibility) => canAccessVisibilityForProfile(profile, visibility);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        portalMode,
        accountStatus,
        permissions,
        loading,
        login,
        logout,
        refreshProfile,
        hasPermission,
        canAccessVisibility,
        isAdmin: isAdmin || !!profile?.isAdmin,
        isModerator,
        showAuthModal,
        openAuthModal,
        closeAuthModal,
        loginWithEmail,
        registerWithEmail,
      }}
    >
      {children}
      {showAuthModal && <AuthModal />}
    </AuthContext.Provider>
  );
}
