import React, { useState, useEffect } from 'react';
import { colors, typography } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { UserProfile } from '../types';
import { Users as UsersIcon, UserPlus, Trash2, X, ShieldAlert, User } from 'lucide-react';

export const UsersScreen: React.FC = () => {
  const { currentUser, setCurrentUser } = useApp();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAddUserOpen, setIsAddUserOpen] = useState<boolean>(false);

  // Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN' | 'OPERATOR' | 'VIEWER'>('OPERATOR');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <ShieldAlert size={40} color={colors.critical} />
        <h2 style={{ color: '#0F172A', fontSize: '18px', fontWeight: 700, margin: 0 }}>
          Access Restricted
        </h2>
        <p style={{ color: '#64748B', fontSize: '13px', margin: 0, maxWidth: '400px' }}>
          User management and role-based access controls require administrator authorization. Please sign in as an Administrator to manage system operator credentials.
        </p>
      </div>
    );
  }

  const fetchUsersList = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.fetchUsers();
      setUsers(data);
    } catch (e) {
      console.warn('Failed to fetch users:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersList();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !newFullName) {
      setErrorMsg('All fields are required.');
      return;
    }

    try {
      await ApiClient.createUser({
        username: newUsername.trim(),
        password: newPassword,
        full_name: newFullName.trim(),
        role: newRole,
      });

      setIsAddUserOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setErrorMsg(null);
      await fetchUsersList();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId: string, uname: string) => {
    if (currentUser.role !== 'ADMIN') {
      alert('Only administrators can delete user accounts.');
      return;
    }
    if (uname === 'admin') {
      alert('Cannot delete the root administrator account.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete user "${uname}"?`)) {
      return;
    }
    try {
      await ApiClient.deleteUser(userId);
      await fetchUsersList();
    } catch (e: any) {
      alert(e.message || 'Failed to delete user');
    }
  };

  const handleImpersonate = (u: UserProfile) => {
    setCurrentUser(u);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        backgroundColor: colors.background,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UsersIcon size={18} color="#2563EB" />
            <span>User Management & RBAC</span>
          </h2>
          <span style={{ fontSize: '12px', color: '#64748B' }}>
            Manage station yard operators, depot supervisors, and system administrators
          </span>
        </div>

        <button
          onClick={() => setIsAddUserOpen(true)}
          style={{
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <UserPlus size={14} />
          <span>Add User Account</span>
        </button>
      </div>

      {/* Users Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 2fr 120px 100px 160px',
            padding: '12px 16px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            fontSize: '11px',
            fontWeight: 700,
            color: '#64748B',
            letterSpacing: '0.4px',
          }}
        >
          <span>USERNAME</span>
          <span>FULL NAME / EMAIL</span>
          <span>ROLE</span>
          <span>STATUS</span>
          <span style={{ textAlign: 'right' }}>ACTIONS</span>
        </div>

        {users.map((u) => {
          const isCurrent = currentUser.username === u.username;
          return (
            <div
              key={u.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 2fr 120px 100px 160px',
                padding: '12px 16px',
                borderBottom: '1px solid #F1F5F9',
                fontSize: '12px',
                alignItems: 'center',
                backgroundColor: isCurrent ? '#F8FAFC' : '#FFFFFF',
              }}
            >
              <span style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={13} color="#64748B" />
                {u.username} {isCurrent && <span style={{ color: '#2563EB', fontSize: '10px' }}>(You)</span>}
              </span>
              <div>
                <span style={{ fontWeight: 600, color: '#1E293B', display: 'block' }}>
                  {u.full_name}
                </span>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  {u.email || `${u.username}@indianrailways.gov.in`}
                </span>
              </div>
              <div>
                <span
                  style={{
                    backgroundColor: u.role === 'ADMIN' ? '#EFF6FF' : '#F1F5F9',
                    color: u.role === 'ADMIN' ? '#2563EB' : '#475569',
                    border: `1px solid ${u.role === 'ADMIN' ? '#BFDBFE' : '#CBD5E1'}`,
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  {u.role}
                </span>
              </div>
              <div>
                <span
                  style={{
                    backgroundColor: u.is_active ? '#ECFDF5' : '#FEE2E2',
                    color: u.is_active ? '#16A34A' : '#DC2626',
                    borderRadius: '10px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleImpersonate(u)}
                  style={{
                    backgroundColor: isCurrent ? '#E2E8F0' : '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    color: '#2563EB',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: isCurrent ? 'default' : 'pointer',
                  }}
                >
                  {isCurrent ? 'Current' : 'Switch Role'}
                </button>
                {u.username !== 'admin' && currentUser.role === 'ADMIN' && (
                  <button
                    onClick={() => handleDeleteUser(u.id, u.username)}
                    style={{
                      backgroundColor: '#FFF1F2',
                      border: '1px solid #FECDD3',
                      color: '#E11D48',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                    title="Delete user account"
                  >
                    <Trash2 size={13} color="#E11D48" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="modal-dialog"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              padding: '24px',
              width: '420px',
              maxWidth: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                Create New User Account
              </h3>
              <button
                onClick={() => setIsAddUserOpen(false)}
                title="Close modal"
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#94A3B8',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '8px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. operator_ndls"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="e.g. Rajesh Kumar (Depot In-Charge)"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  System Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                >
                  <option value="OPERATOR">OPERATOR (Standard Read & Acknowledge)</option>
                  <option value="ADMIN">ADMIN (Full Fleet & Geometry Control)</option>
                  <option value="VIEWER">VIEWER (Read-Only)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#2563EB', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '12px', color: '#FFFFFF', cursor: 'pointer', fontWeight: 700 }}
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

