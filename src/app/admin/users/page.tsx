'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { ADMIN_PRESETS, type AdminPresetKey } from '@/types/permissions';
import type { AccountStatus, PortalMode, UserProfile } from '@/types/users';
import styles from './page.module.css';

const PORTAL_MODES: PortalMode[] = ['guest', 'candidate', 'onboarding', 'staff', 'alumni', 'admin'];
const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended', 'disabled', 'removed'];

export default function AdminUsersPage() {
  const { user, loading, hasPermission } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManageUsers = hasPermission('canManageUsers');
  const canManageRoles = hasPermission('canManageRoles');
  const canViewAuditLog = hasPermission('canViewAuditLog');

  const loadUsers = useCallback(async () => {
    if (!user || (!canManageUsers && !canViewAuditLog)) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as { users?: UserProfile[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load users.');
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [canManageUsers, canViewAuditLog, user]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, loading]);

  const updateUser = async (target: UserProfile, patch: Partial<UserProfile>) => {
    if (!user) return;
    setMessage(null);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/users/${target.uid}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to update user.');
      setMessage('User updated. They may need to sign out and back in for claim changes.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        <p>Manage portal mode, account health, and role presets. Sensitive role changes are audited and synced to Firebase custom claims.</p>
      </header>

      {message && <div className={styles.successMessage}>{message}</div>}
      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.userList}>
        {users.map((target) => (
          <section key={target.uid} className={styles.userCard}>
            <div className={styles.userIdentity}>
              <strong>{target.displayName || target.email || target.uid}</strong>
              <span>{target.email}</span>
              <span>{target.uid}</span>
            </div>

            <label>
              Portal mode
              <select
                value={target.portalMode}
                disabled={!canManageUsers}
                onChange={(event) => updateUser(target, { portalMode: event.target.value as PortalMode })}
              >
                {PORTAL_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </label>

            <label>
              Account status
              <select
                value={target.accountStatus}
                disabled={!canManageUsers}
                onChange={(event) => updateUser(target, { accountStatus: event.target.value as AccountStatus })}
              >
                {ACCOUNT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>

            <label>
              Season role
              <input
                defaultValue={target.primarySeasonRole ?? ''}
                disabled={!canManageUsers}
                onBlur={(event) => {
                  if (event.target.value !== (target.primarySeasonRole ?? '')) updateUser(target, { primarySeasonRole: event.target.value });
                }}
              />
            </label>

            <label>
              Admin preset
              <select
                value={target.adminPreset ?? ''}
                disabled={!canManageRoles}
                onChange={(event) => {
                  const adminPreset = event.target.value as AdminPresetKey | '';
                  const preset = adminPreset ? ADMIN_PRESETS[adminPreset].permissions : [];
                  updateUser(target, {
                    isAdmin: !!adminPreset,
                    adminPreset: adminPreset || null,
                    adminPermissions: preset,
                    portalMode: adminPreset ? 'admin' : target.portalMode,
                  });
                }}
              >
                <option value="">No admin preset</option>
                {Object.values(ADMIN_PRESETS).map((preset) => (
                  <option key={preset.key} value={preset.key}>{preset.name}</option>
                ))}
              </select>
            </label>
          </section>
        ))}
      </div>
    </div>
  );
}
