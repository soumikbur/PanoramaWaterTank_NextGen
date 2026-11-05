import React, { useState, useEffect } from 'react';
import { colors, typography, radii } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { UserProfile, UserActivityEvent } from '../types';
import {
  Users as UsersIcon,
  UserPlus,
  Trash2,
  X,
  ShieldAlert,
  User,
  KeyRound,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  Eye,
  Edit2,
  Search,
  Filter,
  RefreshCw,
  Building,
  Briefcase,
  Phone,
  Mail,
  Calendar,
  Clock,
  Shield,
  Activity,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

export const UsersScreen: React.FC = () => {
  const { currentUser } = useApp();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  // Modals
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetailUser, setSelectedDetailUser] = useState<UserProfile | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [isResetPwdOpen, setIsResetPwdOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<UserProfile | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [forceChangePwd, setForceChangePwd] = useState(true);
  const [resetResult, setResetResult] = useState<{ tempPwd: string } | null>(null);

  // Add / Edit Form State
  const [formFullName, setFormFullName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formDesignation, setFormDesignation] = useState('Station Operator');
  const [formDepartment, setFormDepartment] = useState('Rolling Stock Operations');
  const [formDivisionRegion, setFormDivisionRegion] = useState('Eastern Railway (Howrah)');
  const [formRole, setFormRole] = useState('EMPLOYEE');
  const [formPassword, setFormPassword] = useState('');
  const [formMustChange, setFormMustChange] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Status feedback toast
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 4000);
  };

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
          User & Employee management requires administrator authorization. Please sign in as an Administrator to manage system operator credentials.
        </p>
      </div>
    );
  }

  const fetchUsersList = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.fetchUsers({
        search: searchQuery || undefined,
        department: selectedDept || undefined,
        account_status: selectedStatus || undefined,
        role: selectedRole || undefined,
      });
      setUsers(data);
    } catch (e) {
      console.warn('Failed to fetch users:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersList();
  }, [selectedDept, selectedStatus, selectedRole]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsersList();
  };

  const openAddModal = () => {
    setEditingUser(null);
    setFormFullName('');
    setFormUsername('');
    setFormEmail('');
    setFormPhone('');
    setFormEmployeeId(`EMP-${Math.floor(Math.random() * 800) + 100}`);
    setFormDesignation('Station Yard Operator');
    setFormDepartment('Rolling Stock Operations');
    setFormDivisionRegion('Eastern Railway (Howrah)');
    setFormRole('EMPLOYEE');
    setFormPassword('');
    setFormMustChange(true);
    setFormError(null);
    setIsAddEditOpen(true);
  };

  const openEditModal = (u: UserProfile) => {
    setEditingUser(u);
    setFormFullName(u.full_name);
    setFormUsername(u.username);
    setFormEmail(u.email || '');
    setFormPhone(u.phone || '');
    setFormEmployeeId(u.employee_id || '');
    setFormDesignation(u.designation || 'Station Operator');
    setFormDepartment(u.department || 'Rolling Stock Operations');
    setFormDivisionRegion(u.division_region || 'Eastern Railway (Howrah)');
    setFormRole(u.role);
    setFormPassword('');
    setFormMustChange(Boolean(u.must_change_password));
    setFormError(null);
    setIsAddEditOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFullName.trim() || !formUsername.trim()) {
      setFormError('Full Name and Username are required.');
      return;
    }

    try {
      if (editingUser) {
        await ApiClient.updateUser(editingUser.id, {
          full_name: formFullName.trim(),
          email: formEmail.trim() || undefined,
          phone: formPhone.trim() || undefined,
          employee_id: formEmployeeId.trim() || undefined,
          designation: formDesignation.trim(),
          department: formDepartment.trim(),
          division_region: formDivisionRegion.trim(),
          role: formRole,
        });
        showToast(`Employee "${formFullName}" updated successfully.`);
      } else {
        await ApiClient.createUser({
          username: formUsername.trim(),
          password: formPassword.trim() || undefined,
          full_name: formFullName.trim(),
          email: formEmail.trim() || undefined,
          phone: formPhone.trim() || undefined,
          employee_id: formEmployeeId.trim() || undefined,
          designation: formDesignation.trim(),
          department: formDepartment.trim(),
          division_region: formDivisionRegion.trim(),
          role: formRole,
          must_change_password: formMustChange,
        });
        showToast(`Employee "${formFullName}" registered successfully.`);
      }

      setIsAddEditOpen(false);
      await fetchUsersList();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed.');
    }
  };

  const openDetailDrawer = async (u: UserProfile) => {
    setSelectedDetailUser(u);
    setIsDetailOpen(true);
    try {
      setActivityLoading(true);
      const acts = await ApiClient.fetchUserActivity(u.id);
      setUserActivity(acts);
    } catch (err) {
      setUserActivity([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const openResetPasswordModal = (u: UserProfile) => {
    setResetTargetUser(u);
    setResetPasswordInput('');
    setForceChangePwd(true);
    setResetResult(null);
    setIsResetPwdOpen(true);
  };

  const handleExecutePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;

    try {
      const res = await ApiClient.resetEmployeePassword(
        resetTargetUser.id,
        resetPasswordInput.trim() || undefined,
        forceChangePwd
      );
      setResetResult({ tempPwd: res.temporary_password });
      showToast(`Password successfully reset for ${resetTargetUser.username}.`);
      await fetchUsersList();
    } catch (err: any) {
      alert(err.message || 'Failed to reset password.');
    }
  };

  const handleToggleStatus = async (u: UserProfile, newStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED') => {
    if (u.username === '@admin' || u.username === 'admin') {
      alert('Cannot alter the status of the root administrator account.');
      return;
    }
    const confirmMsg =
      newStatus === 'INACTIVE'
        ? `Are you sure you want to deactivate employee "${u.full_name}"? They will not be able to log in.`
        : newStatus === 'LOCKED'
        ? `Are you sure you want to lock employee "${u.full_name}"?`
        : `Activate employee "${u.full_name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await ApiClient.updateUserStatus(u.id, newStatus);
      showToast(`Status updated to ${newStatus} for ${u.username}.`);
      await fetchUsersList();
      if (selectedDetailUser?.id === u.id) {
        setSelectedDetailUser((prev) => prev ? { ...prev, account_status: newStatus, is_active: newStatus === 'ACTIVE' } : null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update account status.');
    }
  };

  const handleDeleteUser = async (u: UserProfile) => {
    if (u.username === '@admin' || u.username === 'admin') {
      alert('Cannot delete the root administrator account.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete employee "${u.full_name}" (${u.username})? This action cannot be undone.`)) {
      return;
    }
    try {
      await ApiClient.deleteUser(u.id);
      showToast(`Employee "${u.username}" removed.`);
      if (selectedDetailUser?.id === u.id) {
        setIsDetailOpen(false);
      }
      await fetchUsersList();
    } catch (e: any) {
      alert(e.message || 'Failed to delete user.');
    }
  };

  const totalEmployees = users.length;
  const activeEmployees = users.filter((u) => u.account_status === 'ACTIVE' || (u.is_active && !u.account_status)).length;
  const changeRequiredCount = users.filter((u) => u.must_change_password).length;
  const inactiveCount = users.filter((u) => u.account_status === 'INACTIVE' || u.account_status === 'LOCKED').length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        backgroundColor: colors.background,
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Toast Feedback */}
      {statusToast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '6px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle size={16} color="#10B981" />
          <span>{statusToast}</span>
        </div>
      )}

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
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UsersIcon size={20} color="#2563EB" />
            <span>Employee & Access Management</span>
          </h2>
          <span style={{ fontSize: '12px', color: '#64748B' }}>
            Administrative personnel roster, RBAC roles, account statuses, and password governance
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchUsersList}
            title="Refresh Personnel Roster"
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            id="btn-add-employee"
            onClick={openAddModal}
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
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
            }}
          >
            <UserPlus size={14} />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* Stat Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Total Personnel</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{totalEmployees}</div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', textTransform: 'uppercase' }}>Active Employees</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>{activeEmployees}</div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#D97706', textTransform: 'uppercase' }}>Password Change Required</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>{changeRequiredCount}</div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>Inactive / Locked</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>{inactiveCount}</div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', position: 'relative' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px' }} />
          <input
            id="employee-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Name, Employee ID, Username, Designation..."
            style={{
              width: '100%',
              height: '34px',
              paddingLeft: '32px',
              paddingRight: '12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            style={{
              height: '34px',
              padding: '0 8px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              color: '#334155',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option value="">All Departments</option>
            <option value="Rolling Stock Operations">Rolling Stock Operations</option>
            <option value="Signalling & Telecommunications">Signalling & Telecommunications</option>
            <option value="Mechanical Depot">Mechanical Depot</option>
            <option value="Electrical Engineering">Electrical Engineering</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              height: '34px',
              padding: '0 8px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              color: '#334155',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="LOCKED">LOCKED</option>
          </select>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            style={{
              height: '34px',
              padding: '0 8px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              color: '#334155',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option value="">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="EMPLOYEE">EMPLOYEE</option>
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '110px 180px 200px 110px 100px 130px 160px',
            padding: '12px 16px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            fontSize: '11px',
            fontWeight: 700,
            color: '#64748B',
            letterSpacing: '0.4px',
            alignItems: 'center',
          }}
        >
          <span>EMP ID</span>
          <span>PERSONNEL</span>
          <span>DEPARTMENT & ROLE</span>
          <span>STATUS</span>
          <span>PWD STATUS</span>
          <span>LAST ACTIVITY</span>
          <span style={{ textAlign: 'right' }}>ACTIONS</span>
        </div>

        {users.length === 0 && !loading && (
          <div style={{ padding: '36px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
            No employee records match the filter criteria.
          </div>
        )}

        {users.map((u) => {
          const isCurrent = currentUser.username === u.username;
          const isRootAdmin = u.username === '@admin' || u.username === 'admin';
          const status = u.account_status || (u.is_active ? 'ACTIVE' : 'INACTIVE');

          return (
            <div
              key={u.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 180px 200px 110px 100px 130px 160px',
                padding: '12px 16px',
                borderBottom: '1px solid #F1F5F9',
                fontSize: '12px',
                alignItems: 'center',
                backgroundColor: isCurrent ? '#F8FAFC' : '#FFFFFF',
                transition: 'background-color 0.1s ease',
              }}
            >
              {/* Employee ID */}
              <div>
                <span style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
                  {u.employee_id || 'N/A'}
                </span>
              </div>

              {/* Personnel (Name & Username) */}
              <div>
                <div style={{ fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>{u.full_name}</span>
                  {isCurrent && <span style={{ color: '#2563EB', fontSize: '10px', fontWeight: 700 }}>(You)</span>}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <User size={11} />
                  <span>{u.username}</span>
                </div>
              </div>

              {/* Department & Designation */}
              <div>
                <span style={{ fontWeight: 500, color: '#1E293B', display: 'block' }}>
                  {u.designation || 'Operator'}
                </span>
                <span style={{ fontSize: '10px', color: '#64748B' }}>
                  {u.department || 'Operations'}
                </span>
              </div>

              {/* Status Badge */}
              <div>
                <span
                  style={{
                    backgroundColor: status === 'ACTIVE' ? '#ECFDF5' : status === 'LOCKED' ? '#FEF3C7' : '#FEE2E2',
                    color: status === 'ACTIVE' ? '#16A34A' : status === 'LOCKED' ? '#B45309' : '#DC2626',
                    border: `1px solid ${status === 'ACTIVE' ? '#A7F3D0' : status === 'LOCKED' ? '#FDE68A' : '#FECDD3'}`,
                    borderRadius: '10px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  {status}
                </span>
              </div>

              {/* Password Status */}
              <div>
                {u.must_change_password ? (
                  <span
                    style={{
                      backgroundColor: '#FEF3C7',
                      color: '#B45309',
                      border: '1px solid #FDE68A',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '9px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <AlertTriangle size={10} />
                    <span>Reset Needed</span>
                  </span>
                ) : (
                  <span style={{ color: '#64748B', fontSize: '11px' }}>Normal</span>
                )}
              </div>

              {/* Last Activity */}
              <div>
                <span style={{ fontSize: '11px', color: '#475569' }}>
                  {u.last_activity_at ? new Date(u.last_activity_at).toLocaleDateString() : 'Never'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
                  onClick={() => openDetailDrawer(u)}
                  title="View Complete Employee Profile"
                  style={{
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    color: '#2563EB',
                    borderRadius: '4px',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Eye size={13} />
                </button>

                <button
                  onClick={() => openEditModal(u)}
                  title="Edit Employee Information"
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#475569',
                    borderRadius: '4px',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Edit2 size={13} />
                </button>

                {!isRootAdmin && (
                  <button
                    onClick={() => openResetPasswordModal(u)}
                    title="Reset Employee Password (Admin Only)"
                    style={{
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      color: '#16A34A',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <KeyRound size={13} />
                  </button>
                )}

                {!isRootAdmin && (
                  <button
                    onClick={() => handleToggleStatus(u, status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                    title={status === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                    style={{
                      backgroundColor: status === 'ACTIVE' ? '#FFFBEB' : '#ECFDF5',
                      border: `1px solid ${status === 'ACTIVE' ? '#FDE68A' : '#A7F3D0'}`,
                      color: status === 'ACTIVE' ? '#B45309' : '#16A34A',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {status === 'ACTIVE' ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                )}

                {!isRootAdmin && (
                  <button
                    onClick={() => handleDeleteUser(u)}
                    title="Delete Employee Account"
                    style={{
                      backgroundColor: '#FFF1F2',
                      border: '1px solid #FECDD3',
                      color: '#E11D48',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 1. Add / Edit Employee Modal */}
      {isAddEditOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: radii.md,
              width: '100%',
              maxWidth: '560px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={18} color="#2563EB" />
                <span>{editingUser ? 'Edit Employee Details' : 'Register New Employee'}</span>
              </h3>
              <button onClick={() => setIsAddEditOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} color="#64748B" />
              </button>
            </div>

            {formError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '12px', borderRadius: '4px', marginBottom: '12px' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    required
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Username *
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="e.g. @rajesh.kumar"
                    required
                    disabled={Boolean(editingUser)}
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Employee ID
                  </label>
                  <input
                    type="text"
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    placeholder="EMP-XXX"
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Role
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="EMPLOYEE">EMPLOYEE (Standard Operator)</option>
                    <option value="ADMIN">ADMIN (Full Console Access)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Designation
                  </label>
                  <input
                    type="text"
                    value={formDesignation}
                    onChange={(e) => setFormDesignation(e.target.value)}
                    placeholder="e.g. Yard Controller"
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Department
                  </label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="e.g. Rolling Stock Operations"
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Official Email
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="employee@railways.gov.in"
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+91-XXXXXXXXXX"
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Division / Operational Region
                </label>
                <input
                  type="text"
                  value={formDivisionRegion}
                  onChange={(e) => setFormDivisionRegion(e.target.value)}
                  placeholder="e.g. Eastern Railway (Howrah - Asansol)"
                  style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              {!editingUser && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Initial Password (leave empty to auto-generate temporary password)
                  </label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Leave empty or set minimum 6 chars"
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                  <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="form-must-change"
                      checked={formMustChange}
                      onChange={(e) => setFormMustChange(e.target.checked)}
                    />
                    <label htmlFor="form-must-change" style={{ fontSize: '11px', color: '#475569', cursor: 'pointer' }}>
                      Force employee to change password on first login
                    </label>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddEditOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontSize: '12px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '4px', border: 'none', backgroundColor: '#2563EB', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {editingUser ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Detailed Employee Profile Drawer */}
      {isDetailOpen && selectedDetailUser && (
        <>
          <div
            onClick={() => setIsDetailOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(2px)',
              zIndex: 999,
            }}
          />
          <div
            className="drawer-slide-in"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '520px',
              maxWidth: '100vw',
              backgroundColor: '#FFFFFF',
              borderLeft: '1px solid #CBD5E1',
              boxShadow: '-6px 0 28px rgba(0,0,0,0.20)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '18px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                  {selectedDetailUser.full_name}
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                  {selectedDetailUser.username} &bull; {selectedDetailUser.employee_id || 'ID N/A'}
                </span>
              </div>
              <button onClick={() => setIsDetailOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={18} color="#64748B" />
              </button>
            </div>

            {/* Drawer Body Scroll */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Section 1: Personal Information */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} />
                  <span>1. Personal Information</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Full Name</span>
                    <strong style={{ color: '#0F172A' }}>{selectedDetailUser.full_name}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Employee ID</span>
                    <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>{selectedDetailUser.employee_id || 'EMP-N/A'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Email</span>
                    <span style={{ color: '#0F172A' }}>{selectedDetailUser.email || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Contact Phone</span>
                    <span style={{ color: '#0F172A' }}>{selectedDetailUser.phone || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Employment Information */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Briefcase size={14} />
                  <span>2. Employment Information</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Designation</span>
                    <strong style={{ color: '#0F172A' }}>{selectedDetailUser.designation || 'Operator'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Department</span>
                    <span style={{ color: '#0F172A' }}>{selectedDetailUser.department || 'Operations'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Division / Region</span>
                    <span style={{ color: '#0F172A' }}>{selectedDetailUser.division_region || 'Eastern Railway'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Joining Date</span>
                    <span style={{ color: '#0F172A' }}>
                      {selectedDetailUser.joining_date ? new Date(selectedDetailUser.joining_date).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 3: Account Information */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} />
                  <span>3. Account & Security</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Username</span>
                    <strong style={{ color: '#0F172A' }}>{selectedDetailUser.username}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Role</span>
                    <strong style={{ color: '#2563EB' }}>{selectedDetailUser.role}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Account Status</span>
                    <span style={{ fontWeight: 700, color: selectedDetailUser.account_status === 'ACTIVE' ? '#16A34A' : '#DC2626' }}>
                      {selectedDetailUser.account_status || 'ACTIVE'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Password Status</span>
                    <span>{selectedDetailUser.must_change_password ? 'Password Change Required' : 'Normal / Verified'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Last Successful Login</span>
                    <span style={{ color: '#475569' }}>
                      {selectedDetailUser.last_login_at ? new Date(selectedDetailUser.last_login_at).toLocaleString() : 'Never'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>Last Recorded Activity</span>
                    <span style={{ color: '#475569' }}>
                      {selectedDetailUser.last_activity_at ? new Date(selectedDetailUser.last_activity_at).toLocaleString() : 'Never'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 4: Activity History Timeline */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={14} />
                  <span>4. Activity & Security History</span>
                </h4>
                {activityLoading && <div style={{ fontSize: '12px', color: '#64748B' }}>Loading audit records...</div>}
                {!activityLoading && userActivity.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#64748B' }}>No security events recorded for this user yet.</div>
                )}
                {!activityLoading && userActivity.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {userActivity.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#F8FAFC',
                          borderRadius: '4px',
                          border: '1px solid #E2E8F0',
                          fontSize: '11px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#0F172A' }}>
                          <span>{ev.action}</span>
                          <span style={{ color: '#64748B', fontSize: '10px' }}>
                            {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ''}
                          </span>
                        </div>
                        {ev.details && <div style={{ color: '#64748B', fontSize: '10px', marginTop: '2px' }}>{ev.details}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => openEditModal(selectedDetailUser)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Edit2 size={13} />
                <span>Edit Profile</span>
              </button>

              {selectedDetailUser.username !== '@admin' && selectedDetailUser.username !== 'admin' && (
                <button
                  onClick={() => openResetPasswordModal(selectedDetailUser)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <KeyRound size={13} />
                  <span>Reset Password</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* 3. Reset Password Modal */}
      {isResetPwdOpen && resetTargetUser && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1060,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: radii.md,
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} color="#16A34A" />
                <span>Reset Password for {resetTargetUser.full_name}</span>
              </h3>
              <button onClick={() => setIsResetPwdOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} color="#64748B" />
              </button>
            </div>

            {resetResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '14px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>
                    Password Successfully Reset!
                  </div>
                  <div style={{ fontSize: '12px', color: '#334155', marginBottom: '8px' }}>
                    Share this temporary credential with the employee securely:
                  </div>
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#FFFFFF',
                      border: '1px dashed #16A34A',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '14px',
                      color: '#0F172A',
                      userSelect: 'all',
                    }}
                  >
                    {resetResult.tempPwd}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '8px' }}>
                    The employee will be required to change this password immediately upon their next login.
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setIsResetPwdOpen(false)}
                    style={{ padding: '8px 18px', backgroundColor: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecutePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                  Set a temporary password for <strong>{resetTargetUser.username}</strong> or leave blank to automatically generate a secure one.
                </p>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    New Password (Optional)
                  </label>
                  <input
                    type="text"
                    value={resetPasswordInput}
                    onChange={(e) => setResetPasswordInput(e.target.value)}
                    placeholder="Leave empty for auto-generated password"
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="checkbox"
                    id="chk-force-change"
                    checked={forceChangePwd}
                    onChange={(e) => setForceChangePwd(e.target.checked)}
                  />
                  <label htmlFor="chk-force-change" style={{ fontSize: '12px', color: '#334155', cursor: 'pointer' }}>
                    Force employee to change password on next login
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsResetPwdOpen(false)}
                    style={{ padding: '8px 14px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '8px 18px', borderRadius: '4px', border: 'none', backgroundColor: '#16A34A', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Reset Password
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
