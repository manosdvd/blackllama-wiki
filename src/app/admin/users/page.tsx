'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { ADMIN_PRESETS, type AdminPresetKey } from '@/types/permissions';
import type { AccountStatus, PortalMode, UserProfile } from '@/types/users';
import styles from './page.module.css';

const PORTAL_MODES: PortalMode[] = ['guest', 'candidate', 'onboarding', 'staff', 'alumni', 'admin'];
const CREATE_PORTAL_MODES: PortalMode[] = ['candidate', 'onboarding', 'staff', 'alumni'];
const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended', 'disabled', 'removed'];

type NewUserForm = {
  displayName: string;
  email: string;
  password: string;
  portalMode: PortalMode;
  accountStatus: AccountStatus;
  primarySeasonRole: string;
};

const EMPTY_NEW_USER: NewUserForm = {
  displayName: '',
  email: '',
  password: '',
  portalMode: 'candidate',
  accountStatus: 'pending',
  primarySeasonRole: '',
};

export default function AdminUsersPage() {
  const { user, loading, hasPermission } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [newUser, setNewUser] = useState<NewUserForm>(EMPTY_NEW_USER);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canManageUsers = hasPermission('canManageUsers');
  const canManageRoles = hasPermission('canManageRoles');
  const canViewAuditLog = hasPermission('canViewAuditLog');

  const authHeaders = useCallback(async () => {
    if (!user) throw new Error('Sign in is required.');
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }, [user]);

  const loadUsers = useCallback(async () => {
    if (!user || (!canManageUsers && !canViewAuditLog)) return;
    setError(null);
    try {
      const response = await fetch('/api/users', { headers: await authHeaders() });
      const data = (await response.json()) as { users?: UserProfile[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load users.');
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [authHeaders, canManageUsers, canViewAuditLog, user]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, loading]);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageUsers) return;
    setCreating(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          ...(await authHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: newUser.displayName,
          email: newUser.email,
          password: newUser.password || undefined,
          portalMode: newUser.portalMode,
          accountStatus: newUser.accountStatus,
          primarySeasonRole: newUser.primarySeasonRole || null,
        }),
      });
      const data = (await response.json()) as { user?: UserProfile; error?: string; hasTemporaryPassword?: boolean };
      if (!response.ok || !data.user) throw new Error(data.error || 'Unable to create user.');

      setMessage(data.hasTemporaryPassword
        ? 'User created. Give the temporary password to the user through a secure channel.'
        : 'User created. They can sign in with a linked provider or use Firebase password recovery once configured.');
      setNewUser(EMPTY_NEW_USER);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const updateUser = async (target: UserProfile, patch: Partial<UserProfile>) => {
    if (!user) return;
    setBusyUid(target.uid);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/users/${target.uid}`, {
        method: 'PATCH',
        headers: {
          ...(await authHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to update user.');
      setMessage('User updated. Role claim changes take effect after their token refreshes.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUid(null);
    }
  };

  const removeUser = async (target: UserProfile) => {
    if (!canManageUsers || target.uid === user?.uid) return;
    const label = target.displayName || target.email || target.uid;
    if (!window.confirm(`Remove access for ${label}? Their account will be disabled, but records and audit history will be preserved.`)) return;

    setBusyUid(target.uid);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/users/${target.uid}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to remove user.');
      setMessage(data.message || 'User access removed.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUid(null);
    }
  };

  if (loading) return <div className={styles.container}>Loading users...</div>;

  if (!user || (!canManageUsers && !canViewAuditLog)) {
    return (
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <h1>User Management</h1>
          <p>Admin access is required to view users.</p>
        </header>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>User Management</h1>
        <p>Create accounts, manage access and season roles, and apply audited administrative presets. Removing a user disables access without destroying historical records.</p>
      </header>

      {message && <div className={styles.successMessage}>{message}</div>}
      {error && <div className={styles.errorMessage}>{error}</div>}

      {canManageUsers && (
        <form className={styles.createPanel} onSubmit={createUser}>
          <div>
            <h2>Create User</h2>
            <p>Create the Firebase account and matching staff profile together.</p>
          </div>
          <div className={styles.createGrid}>
            <label>
              Display name
              <input
                required
                value={newUser.displayName}
                onChange={(event) => setNewUser((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={newUser.email}
                onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label>
              Temporary password
              <input
                type="password"
                minLength={8}
                placeholder="Optional, 8+ characters"
                value={newUser.password}
                onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
            <label>
              Portal mode
              <select
                value={newUser.portalMode}
                onChange={(event) => setNewUser((current) => ({ ...current, portalMode: event.target.value as PortalMode }))}
              >
                {CREATE_PORTAL_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </label>
            <label>
              Account status
              <select
                value={newUser.accountStatus}
                onChange={(event) => setNewUser((current) => ({ ...current, accountStatus: event.target.value as AccountStatus }))}
              >
                {ACCOUNT_STATUSES.filter((status) => status !== 'removed').map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Season role
              <input
                value={newUser.primarySeasonRole}
                onChange={(event) => setNewUser((current) => ({ ...current, primarySeasonRole: event.target.value }))}
                placeholder="Optional"
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton} disabled={creating}>
              {creating ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      )}

      <div className={styles.userList}>
        {users.length === 0 && <p className={styles.emptyState}>No user profiles were found.</p>}
        {users.map((target) => {
          const busy = busyUid === target.uid;
          return (
            <section key={target.uid} className={styles.userCard} aria-busy={busy}>
              <div className={styles.userIdentity}>
                <input
                  aria-label={`Display name for ${target.email || target.uid}`}
                  defaultValue={target.displayName ?? ''}
                  disabled={!canManageUsers || busy}
                  onBlur={(event) => {
                    if (event.target.value.trim() !== (target.displayName ?? '')) {
                      void updateUser(target, { displayName: event.target.value });
                    }
                  }}
                />
                <span>{target.email}</span>
                <span>{target.uid}</span>
              </div>

              <label>
                Portal mode
                <select
                  value={target.portalMode}
                  disabled={!canManageUsers || busy}
                  onChange={(event) => void updateUser(target, { portalMode: event.target.value as PortalMode })}
                >
                  {PORTAL_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </label>

              <label>
                Account status
                <select
                  value={target.accountStatus}
                  disabled={!canManageUsers || busy || target.uid === user.uid}
                  onChange={(event) => void updateUser(target, { accountStatus: event.target.value as AccountStatus })}
                >
                  {ACCOUNT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>

              <label>
                Season role
                <input
                  defaultValue={target.primarySeasonRole ?? ''}
                  disabled={!canManageUsers || busy}
                  onBlur={(event) => {
                    if (event.target.value !== (target.primarySeasonRole ?? '')) {
                      void updateUser(target, { primarySeasonRole: event.target.value });
                    }
                  }}
                />
              </label>

              <label>
                Admin preset
                <select
                  value={target.adminPreset ?? ''}
                  disabled={!canManageRoles || busy || target.uid === user.uid}
                  onChange={(event) => {
                    const adminPreset = event.target.value as AdminPresetKey | '';
                    const preset = adminPreset ? ADMIN_PRESETS[adminPreset].permissions : [];
                    void updateUser(target, {
                      isAdmin: Boolean(adminPreset),
                      adminPreset: adminPreset || null,
                      adminPermissions: preset,
                      portalMode: adminPreset ? 'admin' : target.portalMode === 'admin' ? 'staff' : target.portalMode,
                    });
                  }}
                >
                  <option value="">No admin preset</option>
                  {Object.values(ADMIN_PRESETS).map((preset) => (
                    <option key={preset.key} value={preset.key}>{preset.name}</option>
                  ))}
                </select>
              </label>

              <div className={styles.actions}>
                {canManageUsers && target.uid !== user.uid && target.accountStatus !== 'removed' && (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={busy}
                    onClick={() => void removeUser(target)}
                  >
                    Remove Access
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
