'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { ADMIN_PRESETS, type AdminPresetKey, ADMIN_PERMISSIONS } from '@/types/permissions';
import type { AccountStatus, PortalMode, UserProfile } from '@/types/users';
import { ChevronDown, ChevronUp, Shield, ShieldOff, CheckCircle, XCircle } from 'lucide-react';
import styles from './page.module.css';

const PORTAL_MODES: PortalMode[] = ['guest', 'candidate', 'onboarding', 'staff', 'alumni', 'admin'];
const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended', 'disabled', 'removed'];

// We'll create a UserRow component to manage the expanded state for each user
function UserRow({ 
  target, 
  canManageUsers, 
  canManageRoles, 
  updateUser 
}: { 
  target: UserProfile; 
  canManageUsers: boolean; 
  canManageRoles: boolean;
  updateUser: (t: UserProfile, p: Partial<UserProfile>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const getStatusBadge = (status: AccountStatus) => {
    switch (status) {
      case 'active': return <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>;
      case 'suspended': return <span className={`${styles.badge} ${styles.badgeError}`}>Suspended</span>;
      case 'disabled': return <span className={`${styles.badge} ${styles.badgeError}`}>Disabled</span>;
      case 'removed': return <span className={`${styles.badge} ${styles.badgeWarning}`}>Removed</span>;
      default: return <span className={`${styles.badge} ${styles.badgePending}`}>Pending</span>;
    }
  };

  const currentPermissions = target.adminPermissions || [];

  return (
    <>
      <tr className={styles.tableRow} onClick={() => setExpanded(!expanded)}>
        <td>
          <div className={styles.userIdentity}>
            <strong>{target.displayName || 'Unknown'}</strong>
            <span>{target.email}</span>
          </div>
        </td>
        <td>{getStatusBadge(target.accountStatus)}</td>
        <td>
          <span className={styles.portalModeBadge}>{target.portalMode}</span>
        </td>
        <td>
          <span className={styles.roleText}>{target.primarySeasonRole || 'None'}</span>
        </td>
        <td>
          {target.adminPreset ? (
            <span className={styles.adminBadge}><Shield size={14}/> {ADMIN_PRESETS[target.adminPreset].name}</span>
          ) : (
            <span className={styles.noAdminBadge}><ShieldOff size={14}/> No Preset</span>
          )}
        </td>
        <td className={styles.chevronCell}>
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </td>
      </tr>
      {expanded && (
        <tr className={styles.expandedRow}>
          <td colSpan={6}>
            <div className={styles.expandedContent}>
              <div className={styles.controlsGrid}>
                <div className={styles.controlGroup}>
                  <label>Portal Mode</label>
                  <select
                    value={target.portalMode}
                    disabled={!canManageUsers}
                    onChange={(event) => updateUser(target, { portalMode: event.target.value as PortalMode })}
                  >
                    {PORTAL_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                  </select>
                </div>
                
                <div className={styles.controlGroup}>
                  <label>Account Status</label>
                  <select
                    value={target.accountStatus}
                    disabled={!canManageUsers}
                    onChange={(event) => updateUser(target, { accountStatus: event.target.value as AccountStatus })}
                  >
                    {ACCOUNT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>

                <div className={styles.controlGroup}>
                  <label>Season Role</label>
                  <input
                    defaultValue={target.primarySeasonRole ?? ''}
                    disabled={!canManageUsers}
                    onBlur={(event) => {
                      if (event.target.value !== (target.primarySeasonRole ?? '')) updateUser(target, { primarySeasonRole: event.target.value });
                    }}
                    placeholder="e.g. Waterfront Director"
                  />
                </div>

                <div className={styles.controlGroup}>
                  <label>Admin Preset</label>
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
                </div>
              </div>

              {/* Visual Grid for Permissions */}
              <div className={styles.permissionsSection}>
                <h4>System Permissions</h4>
                <div className={styles.permissionsGrid}>
                  {ADMIN_PERMISSIONS.map(permission => {
                    const hasPerm = currentPermissions.includes(permission);
                    return (
                      <div key={permission} className={`${styles.permBadge} ${hasPerm ? styles.permActive : styles.permInactive}`}>
                        {hasPerm ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        <span>{permission}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CreateUserForm({ onSuccess, canManageUsers }: { onSuccess: () => void, canManageUsers: boolean }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    email: '',
    displayName: '',
    password: '',
    portalMode: 'staff' as PortalMode,
    adminPreset: '' as AdminPresetKey | ''
  });

  if (!canManageUsers) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      
      setFormData({ email: '', displayName: '', password: '', portalMode: 'staff', adminPreset: '' });
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className={styles.createUserBtn}>
        + Create New User
      </button>
    );
  }

  return (
    <div className={styles.createUserCard}>
      <div className={styles.createUserHeader}>
        <h3>Create New User</h3>
        <button onClick={() => setIsOpen(false)} className={styles.closeBtn}><XCircle size={20} /></button>
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
      <form onSubmit={handleSubmit} className={styles.createUserForm}>
        <div className={styles.controlGroup}>
          <label>Email</label>
          <input 
            type="email" 
            required 
            value={formData.email} 
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            placeholder="user@example.com"
          />
        </div>
        <div className={styles.controlGroup}>
          <label>Display Name</label>
          <input 
            type="text" 
            required 
            value={formData.displayName} 
            onChange={e => setFormData({ ...formData, displayName: e.target.value })}
            placeholder="e.g. John Doe"
          />
        </div>
        <div className={styles.controlGroup}>
          <label>Temporary Password</label>
          <input 
            type="text" 
            required 
            value={formData.password} 
            onChange={e => setFormData({ ...formData, password: e.target.value })}
            placeholder="At least 6 characters"
            minLength={6}
          />
        </div>
        <div className={styles.controlGroup}>
          <label>Portal Mode</label>
          <select 
            value={formData.portalMode} 
            onChange={e => {
              const mode = e.target.value as PortalMode;
              setFormData({ 
                ...formData, 
                portalMode: mode,
                adminPreset: mode === 'admin' ? 'owner' : formData.adminPreset
              });
            }}
          >
            {PORTAL_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </div>
        <div className={styles.controlGroup}>
          <label>Admin Preset (Optional)</label>
          <select
            value={formData.adminPreset}
            onChange={e => {
              const preset = e.target.value as AdminPresetKey | '';
              setFormData({
                ...formData,
                adminPreset: preset,
                portalMode: preset ? 'admin' : formData.portalMode
              });
            }}
          >
            <option value="">No admin preset</option>
            {Object.values(ADMIN_PRESETS).map((preset) => (
              <option key={preset.key} value={preset.key}>{preset.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.createUserActions}>
          <button type="submit" disabled={submitting} className={styles.submitCreateBtn}>
            {submitting ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}

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
      
      // Auto-clear message after 5 seconds
      setTimeout(() => setMessage(null), 5000);
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

      <div className={styles.actionRow}>
        <CreateUserForm onSuccess={() => {
          setMessage('User successfully created.');
          setTimeout(() => setMessage(null), 5000);
          loadUsers();
        }} canManageUsers={canManageUsers} />
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.usersTable}>
          <thead>
            <tr>
              <th>User Identity</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Role</th>
              <th>Admin Access</th>
              <th className={styles.chevronCell}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((target) => (
              <UserRow 
                key={target.uid} 
                target={target} 
                canManageUsers={canManageUsers} 
                canManageRoles={canManageRoles} 
                updateUser={updateUser} 
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
