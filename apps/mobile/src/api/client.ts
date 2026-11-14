/**
 * REST API Client for Panorama Water Tank Monitor Backend.
 */

import {
  TankLiveStatus,
  Device,
  DeviceDiagnostics,
  TelemetryHistory,
  AlarmItem,
  AlarmStats,
  SettingItem,
  RegionSummary,
  TrainOverviewItem,
  TrainConsist,
  UserProfile,
  EmployeeRegistrationPayload,
  TrainLocation,
  CoachFormInput,
  CoachConsist,
  DeviceCreatePayload
} from '../types';
import { TrainLookupResult, TrainCreatePayload } from '../types/train';
import { deviceRegistry } from '../services/deviceRegistry';
import { localFleetStore } from '../services/localFleetStore';
import { alertNotificationService } from '../services/alertNotificationService';
import {
  mqttService,
  CENTRAL_SETTINGS_TOPIC,
  CENTRAL_USERS_TOPIC,
  CENTRAL_DELTA_SYNC_TOPIC,
} from '../services/mqttService';
import { Logger } from '../services/logger';

const USERS_STORAGE_KEY = 'panorama_users_store';
const REGISTRATIONS_STORAGE_KEY = 'panorama_registrations_store';

const DEFAULT_USERS: UserProfile[] = [
  {
    id: 'admin-demo-001',
    username: '@admin',
    full_name: 'Chief Rolling Stock Engineer',
    email: 'admin@panorama.railways.gov',
    phone: '+91-9876543210',
    employee_id: 'EMP-001',
    designation: 'Senior Divisional Mechanical Engineer',
    department: 'Rolling Stock SCADA Ops',
    division_region: 'Headquarters',
    role: 'ADMIN',
    account_status: 'ACTIVE',
    is_active: true,
    must_change_password: false,
    joining_date: '2023-01-01',
    last_login_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: 'emp-demo-002',
    username: '@employee',
    full_name: 'Railway SCADA Technician',
    email: 'employee@panorama.railways.gov',
    phone: '+91-9876543211',
    employee_id: 'EMP-002',
    designation: 'WLI Maintenance Engineer',
    department: 'Mechanical (Rolling Stock)',
    division_region: 'EAST',
    role: 'EMPLOYEE',
    account_status: 'ACTIVE',
    is_active: true,
    must_change_password: false,
    joining_date: '2024-01-15',
    last_login_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    created_at: '2024-01-15T00:00:00Z',
  },
];

function readLocalUsers(): UserProfile[] {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_USERS;
  try {
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return DEFAULT_USERS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

function writeLocalUsers(users: UserProfile[], skipPublish = false): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    window.dispatchEvent(new CustomEvent('panorama:users-updated'));
    if (!skipPublish) {
      mqttService.publish(CENTRAL_USERS_TOPIC, { users, registrations: readLocalRegistrations() }, true);
      mqttService.publish(CENTRAL_DELTA_SYNC_TOPIC, { type: 'USERS_UPDATE' });
    }
  } catch {}
}

function readLocalRegistrations(): UserProfile[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(REGISTRATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalRegistrations(regs: UserProfile[], skipPublish = false): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(REGISTRATIONS_STORAGE_KEY, JSON.stringify(regs));
    window.dispatchEvent(new CustomEvent('panorama:users-updated'));
    if (!skipPublish) {
      mqttService.publish(CENTRAL_USERS_TOPIC, { users: readLocalUsers(), registrations: regs }, true);
      mqttService.publish(CENTRAL_DELTA_SYNC_TOPIC, { type: 'USERS_UPDATE' });
    }
  } catch {}
}

export const PRODUCTION_BACKEND_URL = 'https://panorama-water-tank-backend.onrender.com/api/v1';

export function resolveApiBase(): string {
  // 1. User manual override stored in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    const custom = window.localStorage.getItem('panorama_backend_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }

  // 2. Check local loopback FIRST so local development and testing on 127.0.0.1/localhost connect to local backend
  if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
    const host = window.location.hostname || '127.0.0.1';
    const port = window.location.port || '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      if (port === '8000') {
        return `http://${host}:${port}/api/v1`;
      }
      return `http://${host}:8000/api/v1`;
    }
  }

  // 3. Build-time environment variable injection
  const configured =
    (typeof process !== 'undefined' && (
      process.env?.VITE_API_BASE_URL ||
      process.env?.VITE_BACKEND_URL ||
      process.env?.VITE_API_URL ||
      process.env?.API_BASE_URL ||
      process.env?.API_URL ||
      process.env?.REACT_APP_API_URL
    )) ||
    (typeof import.meta !== 'undefined' && (
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL ||
      (import.meta as any).env?.VITE_API_URL
    ));
  if (configured && String(configured).trim()) {
    return String(configured).trim().replace(/\/+$/, '');
  }

  // 4. Default production backend URL
  return PRODUCTION_BACKEND_URL;
}

export const API_BASE = resolveApiBase();

export class ApiClient {
  private static isBackendAvailable: boolean | null = null;
  private static lastHealthCheckTime = 0;
  private static listenersBound = false;

  static hasBackend(): boolean {
    const base = resolveApiBase();
    return Boolean(base && base.trim().length > 0);
  }

  private static ensureListeners(): void {
    if (this.listenersBound || typeof window === 'undefined') return;
    this.listenersBound = true;
    window.addEventListener('online', () => {
      ApiClient.isBackendAvailable = null;
      ApiClient.lastHealthCheckTime = 0;
    });
    window.addEventListener('panorama:backend-url-changed', () => {
      ApiClient.isBackendAvailable = null;
      ApiClient.lastHealthCheckTime = 0;
    });
    if (window.location && (window.location.hostname.endsWith('github.io') || window.location.hostname.endsWith('pages.dev'))) {
      try {
        fetch('./backend-status.json', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data && data.available === true) {
              ApiClient.isBackendAvailable = true;
              if (window.localStorage) {
                window.localStorage.setItem('panorama_backend_verified', 'true');
              }
            }
          })
          .catch(() => {});
      } catch {}
    }
  }

  static isRemoteUnreachable(): boolean {
    this.ensureListeners();
    const base = resolveApiBase();
    const isLocal = base.includes('127.0.0.1') || base.includes('localhost');
    if (isLocal) {
      return this.isBackendAvailable === false && (Date.now() - this.lastHealthCheckTime < 10000);
    }

    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const host = window.location.hostname;
      if (host.endsWith('github.io') || host.endsWith('pages.dev')) {
        const verified = window.localStorage ? window.localStorage.getItem('panorama_backend_verified') : null;
        if (verified !== 'true' && this.isBackendAvailable !== true) {
          return true;
        }
      }
    }

    if (this.isBackendAvailable === false) {
      if (Date.now() - this.lastHealthCheckTime < 45000) {
        return true;
      }
    }
    return false;
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const base = resolveApiBase();
    if (!base) {
      const noBaseErr: any = new Error(`No backend configured; bypassing network call for ${endpoint}`);
      noBaseErr.status = 503;
      noBaseErr.code = 'NO_BACKEND';
      throw noBaseErr;
    }
    const url = `${base}${endpoint}`;

    if (this.isRemoteUnreachable() && (options.method === 'GET' || !options.method)) {
      const cachedErr: any = new Error(`Remote backend unreachable at ${base}; using cached local store`);
      cachedErr.status = 503;
      cachedErr.code = 'ENOTFOUND';
      throw cachedErr;
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('panorama_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    // Implement AbortController with 10s request timeout
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutId: any = null;
    if (controller) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000);
      if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort());
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller ? controller.signal : options.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      const rawText = await response.text();
      let parsedJson: any = null;
      if (rawText) {
        try {
          parsedJson = JSON.parse(rawText);
        } catch {
          parsedJson = null;
        }
      }

      if (!response.ok) {
        if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
          ApiClient.isBackendAvailable = false;
          ApiClient.lastHealthCheckTime = Date.now();
        }

        let errorMsg = `API error ${response.status}${response.statusText ? `: ${response.statusText}` : ''}`;
        if (parsedJson && (parsedJson.message || parsedJson.detail)) {
          errorMsg = String(parsedJson.detail || parsedJson.message);
        } else if (response.status === 405) {
          errorMsg = 'HTTP 405 Method Not Allowed: API endpoint does not accept this request or is routed to static hosting.';
        }
        Logger.debug('API', 'ApiClient', `${options.method || 'GET'} ${url} returned ${response.status}: ${errorMsg}`, 'request', {
          status: response.status,
          detail: parsedJson || rawText.slice(0, 150),
        });
        const err: any = new Error(errorMsg);
        err.status = response.status;
        if (parsedJson?.code) err.code = parsedJson.code;
        throw err;
      }

      ApiClient.isBackendAvailable = true;

      if (parsedJson !== null) {
        return parsedJson as T;
      }
      if (response.status === 204 || !rawText.trim()) {
        return {} as T;
      }
      throw new Error(`Invalid non-JSON response from ${url}`);
    } catch (fetchErr: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
        ApiClient.isBackendAvailable = false;
        ApiClient.lastHealthCheckTime = Date.now();
      }
      if (fetchErr.name === 'AbortError') {
        const timeoutErr: any = new Error(`Request timeout (10s) exceeded while requesting ${url}`);
        timeoutErr.status = 408;
        timeoutErr.code = 'ETIMEDOUT';
        Logger.debug('API', 'ApiClient', `Request timed out for ${url}`, 'timeout');
        throw timeoutErr;
      }
      Logger.debug('API', 'ApiClient', `Network request to ${url} failed: ${fetchErr?.message || fetchErr}`, 'networkFail');
      throw fetchErr;
    }
  }

  // Auth
  static async login(username: string, password: string): Promise<{ access_token: string; user: UserProfile; must_change_password?: boolean }> {
    try {
      const res = await this.request<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (res.access_token) {
        localStorage.setItem('panorama_token', res.access_token);
      }
      return {
        access_token: res.access_token,
        user: {
          id: res.user.id,
          username: res.user.username,
          full_name: res.user.fullName || res.user.full_name,
          email: res.user.email,
          phone: res.user.phone,
          employee_id: res.user.employeeId || res.user.employee_id,
          designation: res.user.designation,
          department: res.user.department,
          division_region: res.user.divisionRegion || res.user.division_region,
          role: res.user.role,
          account_status: res.user.accountStatus || res.user.account_status || 'ACTIVE',
          is_active: res.user.isActive ?? res.user.is_active ?? true,
          must_change_password: res.user.mustChangePassword ?? res.user.must_change_password ?? res.must_change_password ?? false,
          joining_date: res.user.joiningDate || res.user.joining_date,
          last_login_at: res.user.lastLoginAt || res.user.last_login_at,
          last_activity_at: res.user.lastActivityAt || res.user.last_activity_at,
          created_at: res.user.createdAt || res.user.created_at,
        },
        must_change_password: res.must_change_password ?? res.user.must_change_password ?? false,
      };
    } catch (err: any) {
      // In standalone preview environments where backend is unhosted on origin, fall back to valid credentials
      const cleanUser = username.trim().toLowerCase();
      if ((cleanUser === '@employee' || cleanUser === 'employee') && password === 'Employee@123') {
        const demoUser: UserProfile = {
          id: 'emp-demo-002',
          username: '@employee',
          full_name: 'Railway SCADA Technician',
          email: 'employee@panorama.railways.gov',
          phone: '+91-9876543211',
          employee_id: 'EMP-002',
          designation: 'WLI Maintenance Engineer',
          department: 'Mechanical (Rolling Stock)',
          division_region: 'EAST',
          role: 'EMPLOYEE',
          account_status: 'ACTIVE',
          is_active: true,
          must_change_password: false,
          joining_date: '2024-01-15',
          last_login_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          created_at: '2024-01-15T00:00:00Z',
        };
        const demoToken = 'demo-employee-session-token';
        localStorage.setItem('panorama_token', demoToken);
        localStorage.setItem('panorama_demo_user', JSON.stringify(demoUser));
        return { access_token: demoToken, user: demoUser, must_change_password: false };
      }
      if ((cleanUser === '@admin' || cleanUser === 'admin') && password === 'Admin@123') {
        const demoAdmin: UserProfile = {
          id: 'admin-demo-001',
          username: '@admin',
          full_name: 'Chief Rolling Stock Engineer',
          email: 'admin@panorama.railways.gov',
          phone: '+91-9876543210',
          employee_id: 'EMP-001',
          designation: 'Senior Divisional Mechanical Engineer',
          department: 'Rolling Stock SCADA Ops',
          division_region: 'Headquarters',
          role: 'ADMIN',
          account_status: 'ACTIVE',
          is_active: true,
          must_change_password: false,
          joining_date: '2023-01-01',
          last_login_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          created_at: '2023-01-01T00:00:00Z',
        };
        const demoToken = 'demo-admin-session-token';
        localStorage.setItem('panorama_token', demoToken);
        localStorage.setItem('panorama_demo_user', JSON.stringify(demoAdmin));
        return { access_token: demoToken, user: demoAdmin, must_change_password: false };
      }
      throw err;
    }
  }

  static async fetchCurrentUser(): Promise<UserProfile> {
    try {
      const res = await this.request<any>('/auth/me');
      return {
        id: res.id,
        username: res.username,
        full_name: res.fullName || res.full_name,
        email: res.email,
        phone: res.phone,
        employee_id: res.employeeId || res.employee_id,
        designation: res.designation,
        department: res.department,
        division_region: res.divisionRegion || res.division_region,
        role: res.role,
        account_status: res.accountStatus || res.account_status || 'ACTIVE',
        is_active: res.isActive ?? res.is_active ?? true,
        must_change_password: res.mustChangePassword ?? res.must_change_password ?? false,
        joining_date: res.joiningDate || res.joining_date,
        last_login_at: res.lastLoginAt || res.last_login_at,
        last_activity_at: res.lastActivityAt || res.last_activity_at,
        created_at: res.createdAt || res.created_at,
      };
    } catch (err) {
      const saved = localStorage.getItem('panorama_demo_user');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
      throw err;
    }
  }

  static async changePassword(newPassword: string, currentPassword?: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        new_password: newPassword,
        current_password: currentPassword,
      }),
    });
  }

  static logout(): void {
    const token = localStorage.getItem('panorama_token');
    if (token && API_BASE) {
      try {
        fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }).catch(() => {});
      } catch {}
    }
    localStorage.removeItem('panorama_token');
    localStorage.removeItem('panorama_demo_user');
  }

  // Users & Employee Management
  static async fetchUsers(params?: {
    search?: string;
    department?: string;
    designation?: string;
    account_status?: string;
    role?: string;
  }): Promise<UserProfile[]> {
    if (!API_BASE) {
      let list = readLocalUsers();
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter((u) => u.username.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q));
      }
      if (params?.department) {
        list = list.filter((u) => u.department === params.department);
      }
      if (params?.designation) {
        list = list.filter((u) => u.designation === params.designation);
      }
      if (params?.account_status) {
        list = list.filter((u) => u.account_status === params.account_status);
      }
      if (params?.role) {
        list = list.filter((u) => u.role === params.role);
      }
      return list;
    }
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.department) query.append('department', params.department);
    if (params?.designation) query.append('designation', params.designation);
    if (params?.account_status) query.append('account_status', params.account_status);
    if (params?.role) query.append('role', params.role);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    try {
      const list = await this.request<any[]>(`/users${queryString}`);
      if (!Array.isArray(list)) return readLocalUsers();
      return list.map((u) => ({
        id: u.id,
        username: u.username,
        full_name: u.full_name || u.fullName,
        email: u.email,
        phone: u.phone,
        employee_id: u.employee_id || u.employeeId,
        designation: u.designation,
        department: u.department,
        division_region: u.division_region || u.divisionRegion,
        role: u.role,
        account_status: u.account_status || u.accountStatus || 'ACTIVE',
        is_active: u.is_active ?? u.isActive ?? true,
        must_change_password: u.must_change_password ?? u.mustChangePassword ?? false,
        joining_date: u.joining_date || u.joiningDate,
        last_login_at: u.last_login_at || u.lastLoginAt,
        last_activity_at: u.last_activity_at || u.lastActivityAt,
        created_at: u.created_at || u.createdAt,
      }));
    } catch {
      return readLocalUsers();
    }
  }

  static async createUser(user: {
    username: string;
    password?: string;
    full_name: string;
    email?: string;
    phone?: string;
    employee_id?: string;
    designation?: string;
    department?: string;
    division_region?: string;
    role?: string;
    account_status?: string;
    must_change_password?: boolean;
  }): Promise<UserProfile> {
    if (!API_BASE) {
      const users = readLocalUsers();
      const newUser: UserProfile = {
        id: `user-${Date.now().toString(36)}`,
        username: user.username,
        full_name: user.full_name,
        email: user.email || '',
        phone: user.phone || '',
        employee_id: user.employee_id || '',
        designation: user.designation || 'Technician',
        department: user.department || 'Mechanical',
        division_region: user.division_region || 'Eastern Railway',
        role: (user.role as any) || 'EMPLOYEE',
        account_status: (user.account_status as any) || 'ACTIVE',
        is_active: true,
        must_change_password: user.must_change_password ?? true,
        created_at: new Date().toISOString(),
      };
      users.push(newUser);
      writeLocalUsers(users);
      return newUser;
    }
    const res = await this.request<any>('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: user.username,
        password: user.password,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        employeeId: user.employee_id,
        designation: user.designation,
        department: user.department,
        divisionRegion: user.division_region,
        role: user.role,
        accountStatus: user.account_status,
        mustChangePassword: user.must_change_password ?? true,
      }),
    });
    return {
      id: res.id,
      username: res.username,
      full_name: res.fullName || res.full_name,
      email: res.email,
      phone: res.phone,
      employee_id: res.employeeId || res.employee_id,
      designation: res.designation,
      department: res.department,
      division_region: res.divisionRegion || res.division_region,
      role: res.role,
      account_status: res.accountStatus || res.account_status || 'ACTIVE',
      is_active: res.isActive ?? res.is_active ?? true,
      must_change_password: res.mustChangePassword ?? res.must_change_password ?? false,
      created_at: res.createdAt || res.created_at,
    };
  }

  static async updateUser(
    userId: string,
    user: {
      full_name?: string;
      email?: string;
      phone?: string;
      employee_id?: string;
      designation?: string;
      department?: string;
      division_region?: string;
      role?: string;
      account_status?: string;
      is_active?: boolean;
    }
  ): Promise<UserProfile> {
    if (!API_BASE) {
      const users = readLocalUsers();
      const idx = users.findIndex((u) => u.id === userId || u.username === userId);
      if (idx !== -1) {
        users[idx] = {
          ...users[idx],
          ...user,
          full_name: user.full_name || users[idx].full_name,
          role: (user.role as any) || users[idx].role,
          account_status: (user.account_status as any) || users[idx].account_status,
        };
        writeLocalUsers(users);
        return users[idx];
      }
      throw new Error('User not found.');
    }
    const res = await this.request<any>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        employeeId: user.employee_id,
        designation: user.designation,
        department: user.department,
        divisionRegion: user.division_region,
        role: user.role,
        accountStatus: user.account_status,
        isActive: user.is_active,
      }),
    });
    return {
      id: res.id,
      username: res.username,
      full_name: res.fullName || res.full_name,
      email: res.email,
      phone: res.phone,
      employee_id: res.employeeId || res.employee_id,
      designation: res.designation,
      department: res.department,
      division_region: res.divisionRegion || res.division_region,
      role: res.role,
      account_status: res.accountStatus || res.account_status || 'ACTIVE',
      is_active: res.isActive ?? res.is_active ?? true,
      must_change_password: res.mustChangePassword ?? res.must_change_password ?? false,
    };
  }

  static async resetEmployeePassword(
    userId: string,
    newPassword?: string,
    forceChangeNextLogin: boolean = true
  ): Promise<{ status: string; message: string; temporary_password: string; must_change_password: boolean }> {
    if (!API_BASE) {
      return {
        status: 'success',
        message: 'Password reset successfully',
        temporary_password: newPassword || 'Railway@2026',
        must_change_password: forceChangeNextLogin,
      };
    }
    return this.request<{ status: string; message: string; temporary_password: string; must_change_password: boolean }>(
      `/users/${userId}/reset-password`,
      {
        method: 'POST',
        body: JSON.stringify({
          new_password: newPassword,
          force_change_next_login: forceChangeNextLogin,
        }),
      }
    );
  }

  static async updateUserStatus(
    userId: string,
    accountStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED'
  ): Promise<UserProfile> {
    if (!API_BASE) {
      const users = readLocalUsers();
      const idx = users.findIndex((u) => u.id === userId || u.username === userId);
      if (idx !== -1) {
        users[idx].account_status = accountStatus;
        writeLocalUsers(users);
        return users[idx];
      }
      throw new Error('User not found.');
    }
    const res = await this.request<any>(`/users/${userId}/status`, {
      method: 'POST',
      body: JSON.stringify({ account_status: accountStatus }),
    });
    return {
      id: res.id,
      username: res.username,
      full_name: res.fullName || res.full_name,
      email: res.email,
      role: res.role,
      account_status: res.accountStatus || res.account_status,
      is_active: res.isActive ?? res.is_active,
    };
  }

  static async deleteUser(userId: string): Promise<void> {
    if (!API_BASE) {
      const users = readLocalUsers().filter((u) => u.id !== userId && u.username !== userId);
      writeLocalUsers(users);
      return;
    }
    await this.request(`/users/${userId}`, { method: 'DELETE' });
  }

  static async fetchUserActivity(userId: string): Promise<any[]> {
    return this.request<any[]>(`/users/${userId}/activity`);
  }

  // Employee Registration & Approval Workflow
  static async registerEmployee(payload: EmployeeRegistrationPayload): Promise<{
    message: string;
    registration_id: string;
    username: string;
    status: string;
  }> {
    if (!API_BASE) {
      const regs = readLocalRegistrations();
      const regId = `reg-${Date.now().toString(36)}`;
      const newReg: UserProfile = {
        id: regId,
        username: payload.username,
        full_name: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        employee_id: payload.employeeId,
        designation: payload.designation,
        department: payload.department,
        division_region: payload.divisionRegion,
        role: 'EMPLOYEE',
        account_status: 'PENDING_APPROVAL',
        is_active: false,
        must_change_password: false,
        joining_date: payload.joiningDate,
        date_of_birth: payload.dateOfBirth,
        gender: payload.gender,
        residential_address: payload.residentialAddress,
        assigned_location: payload.assignedLocation,
        reporting_manager: payload.reportingManager,
        document_name: payload.documentName,
        registration_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      regs.unshift(newReg);
      writeLocalRegistrations(regs);
      return {
        message: 'Employee registration submitted successfully.',
        registration_id: regId,
        username: payload.username,
        status: 'PENDING_APPROVAL',
      };
    }
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: payload.fullName,
        date_of_birth: payload.dateOfBirth,
        gender: payload.gender,
        email: payload.email,
        phone: payload.phone,
        residential_address: payload.residentialAddress,
        employee_id: payload.employeeId,
        designation: payload.designation,
        department: payload.department,
        joining_date: payload.joiningDate,
        division_region: payload.divisionRegion,
        assigned_location: payload.assignedLocation,
        reporting_manager: payload.reportingManager,
        username: payload.username,
        password: payload.password,
        confirm_password: payload.confirmPassword,
        document_name: payload.documentName,
        document_data: payload.documentData,
      }),
    });
  }

  static async fetchRegistrations(params?: {
    status?: string;
    search?: string;
  }): Promise<UserProfile[]> {
    if (!API_BASE) {
      let list = readLocalRegistrations();
      if (params?.status) {
        list = list.filter((r) => r.account_status === params.status);
      }
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter((r) => r.username.toLowerCase().includes(q) || r.full_name.toLowerCase().includes(q));
      }
      return list;
    }
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    try {
      const list = await this.request<any[]>(`/users/registrations${queryString}`);
      if (!Array.isArray(list)) return readLocalRegistrations();
      return list.map((u) => ({
        id: u.id,
        username: u.username,
        full_name: u.full_name || u.fullName,
        email: u.email,
        phone: u.phone,
        employee_id: u.employee_id || u.employeeId,
        designation: u.designation,
        department: u.department,
        division_region: u.division_region || u.divisionRegion,
        role: u.role,
        account_status: u.account_status || u.accountStatus || 'PENDING_APPROVAL',
        is_active: u.is_active ?? u.isActive ?? false,
        must_change_password: u.must_change_password ?? u.mustChangePassword ?? false,
        joining_date: u.joining_date || u.joiningDate,
        date_of_birth: u.date_of_birth || u.dateOfBirth,
        gender: u.gender,
        residential_address: u.residential_address || u.residentialAddress,
        assigned_location: u.assigned_location || u.assignedLocation,
        reporting_manager: u.reporting_manager || u.reportingManager,
        document_name: u.document_name || u.documentName,
        document_url: u.document_url || u.documentUrl,
        registration_date: u.registration_date || u.registrationDate,
        approved_at: u.approved_at || u.approvedAt,
        approved_by: u.approved_by || u.approvedBy,
        rejection_reason: u.rejection_reason || u.rejectionReason,
        last_login_at: u.last_login_at || u.lastLoginAt,
        last_activity_at: u.last_activity_at || u.lastActivityAt,
        created_at: u.created_at || u.createdAt,
      }));
    } catch {
      return readLocalRegistrations();
    }
  }

  static async getRegistrationDetail(regId: string): Promise<UserProfile> {
    if (!API_BASE) {
      const regs = readLocalRegistrations();
      const r = regs.find((item) => item.id === regId);
      if (r) return r;
      throw new Error('Registration record not found.');
    }
    const u = await this.request<any>(`/users/registrations/${regId}`);
    return {
      id: u.id,
      username: u.username,
      full_name: u.full_name || u.fullName,
      email: u.email,
      phone: u.phone,
      employee_id: u.employee_id || u.employeeId,
      designation: u.designation,
      department: u.department,
      division_region: u.division_region || u.divisionRegion,
      role: u.role,
      account_status: u.account_status || u.accountStatus,
      is_active: u.is_active ?? u.isActive ?? false,
      must_change_password: u.must_change_password ?? u.mustChangePassword ?? false,
      joining_date: u.joining_date || u.joiningDate,
      date_of_birth: u.date_of_birth || u.dateOfBirth,
      gender: u.gender,
      residential_address: u.residential_address || u.residentialAddress,
      assigned_location: u.assigned_location || u.assignedLocation,
      reporting_manager: u.reporting_manager || u.reportingManager,
      document_name: u.document_name || u.documentName,
      document_url: u.document_url || u.documentUrl,
      registration_date: u.registration_date || u.registrationDate,
      approved_at: u.approved_at || u.approvedAt,
      approved_by: u.approved_by || u.approvedBy,
      rejection_reason: u.rejection_reason || u.rejectionReason,
      last_login_at: u.last_login_at || u.lastLoginAt,
      last_activity_at: u.last_activity_at || u.lastActivityAt,
      created_at: u.created_at || u.createdAt,
    };
  }

  static async approveRegistration(regId: string): Promise<UserProfile> {
    if (!API_BASE) {
      const regs = readLocalRegistrations();
      const idx = regs.findIndex((r) => r.id === regId);
      if (idx !== -1) {
        const reg = regs[idx];
        reg.account_status = 'ACTIVE';
        reg.is_active = true;
        reg.approved_at = new Date().toISOString();
        reg.approved_by = '@admin';
        writeLocalRegistrations(regs);

        const users = readLocalUsers();
        if (!users.some((u) => u.username === reg.username)) {
          users.push(reg);
          writeLocalUsers(users);
        }
        return reg;
      }
      throw new Error('Registration request not found.');
    }
    const u = await this.request<any>(`/users/registrations/${regId}/approve`, {
      method: 'POST',
    });
    return {
      id: u.id,
      username: u.username,
      full_name: u.full_name || u.fullName,
      email: u.email,
      phone: u.phone,
      employee_id: u.employee_id || u.employeeId,
      designation: u.designation,
      department: u.department,
      division_region: u.division_region || u.divisionRegion,
      role: u.role,
      account_status: u.account_status || u.accountStatus,
      is_active: u.is_active ?? u.isActive ?? true,
      must_change_password: u.must_change_password ?? u.mustChangePassword ?? false,
      joining_date: u.joining_date || u.joiningDate,
      approved_at: u.approved_at || u.approvedAt,
      approved_by: u.approved_by || u.approvedBy,
      created_at: u.created_at || u.createdAt,
    };
  }

  static async rejectRegistration(regId: string, rejectionReason: string): Promise<UserProfile> {
    if (!API_BASE) {
      const regs = readLocalRegistrations();
      const idx = regs.findIndex((r) => r.id === regId);
      if (idx !== -1) {
        const reg = regs[idx];
        reg.account_status = 'REJECTED';
        reg.is_active = false;
        reg.rejection_reason = rejectionReason;
        writeLocalRegistrations(regs);
        return reg;
      }
      throw new Error('Registration request not found.');
    }
    const u = await this.request<any>(`/users/registrations/${regId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason: rejectionReason }),
    });
    return {
      id: u.id,
      username: u.username,
      full_name: u.full_name || u.fullName,
      email: u.email,
      phone: u.phone,
      employee_id: u.employee_id || u.employeeId,
      designation: u.designation,
      department: u.department,
      division_region: u.division_region || u.divisionRegion,
      role: u.role,
      account_status: u.account_status || u.accountStatus,
      is_active: false,
      rejection_reason: u.rejection_reason || u.rejectionReason,
      created_at: u.created_at || u.createdAt,
    };
  }

  // Trains and Fleet Management
  static async fetchRegionsSummary(): Promise<RegionSummary[]> {
    if (!API_BASE) {
      return localFleetStore.getRegionsSummary();
    }
    try {
      const res = await this.request<RegionSummary[]>('/trains/regions');
      if (Array.isArray(res)) {
        localFleetStore.syncFromAuthoritativeRegions(res);
        return res;
      }
      return localFleetStore.getRegionsSummary();
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchRegionsSummary failed, falling back to cached local fleet', 'fetchRegionsSummary', err);
      return localFleetStore.getRegionsSummary();
    }
  }

  static async fetchTrains(region?: string, search?: string): Promise<TrainOverviewItem[]> {
    if (!API_BASE) {
      return localFleetStore.listTrains(region, search);
    }
    const params = new URLSearchParams();
    if (region) params.append('region', region);
    if (search) params.append('search', search);
    const query = params.toString() ? `?${params.toString()}` : '';
    try {
      return await this.request<TrainOverviewItem[]>(`/trains${query}`);
    } catch {
      return localFleetStore.listTrains(region, search);
    }
  }

  static async fetchTrainConsist(trainNumber: string): Promise<TrainConsist> {
    const clean = (trainNumber || '').trim();
    if (!clean) {
      throw new Error('Train number is required.');
    }
    if (!API_BASE) {
      const localConsist = localFleetStore.getTrainConsist(clean);
      if (localConsist) return localConsist;
      throw new Error(`Train ${clean} not found.`);
    }
    try {
      const consist = await this.request<TrainConsist>(`/trains/${encodeURIComponent(clean)}/consist`);
      if (consist) {
        localFleetStore.syncTrainConsist(clean, consist);
        return consist;
      }
      const localConsist = localFleetStore.getTrainConsist(clean);
      if (localConsist) return localConsist;
      throw new Error(`Train ${clean} not found.`);
    } catch {
      const localConsist = localFleetStore.getTrainConsist(clean);
      if (localConsist) return localConsist;
      throw new Error(`Train ${clean} not found.`);
    }
  }

  static async lookupTrain(
    trainNumber: string,
    options?: { refresh?: boolean; signal?: AbortSignal }
  ): Promise<TrainLookupResult> {
    const clean = encodeURIComponent(trainNumber.trim());
    const qs = options?.refresh ? '?refresh=true' : '';
    return this.request<TrainLookupResult>(`/trains/lookup/${clean}${qs}`, {
      signal: options?.signal,
    });
  }

  private static notifyCrossTabFleetSync(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('panorama_fleet_sync_ts', String(Date.now()));
      }
    } catch {
      // Ignore storage access errors in restricted contexts
    }
  }

  static async createTrain(data: TrainCreatePayload): Promise<any> {
    let res: any;
    if (API_BASE) {
      res = await this.request('/trains', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      try {
        localFleetStore.createTrain(data);
      } catch {}
    } else {
      res = localFleetStore.createTrain(data);
    }
    try {
      mqttService.publish('panorama/fleet/sync', { action: 'create_train', train: data });
    } catch {}
    this.notifyCrossTabFleetSync();
    return res;
  }

  static async updateTrain(trainNumber: string, data: { name?: string; region?: string; type?: string }): Promise<any> {
    let res: any;
    if (API_BASE) {
      res = await this.request(`/trains/${encodeURIComponent(trainNumber)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      try {
        localFleetStore.updateTrain(trainNumber, data);
      } catch {}
    } else {
      res = localFleetStore.updateTrain(trainNumber, data);
    }
    try {
      mqttService.publish('panorama/fleet/sync', { action: 'update_train', train_number: trainNumber, data });
    } catch {}
    this.notifyCrossTabFleetSync();
    return res;
  }

  static async deleteTrain(trainNumber: string): Promise<{ success?: boolean; message: string; trainId?: string }> {
    const clean = encodeURIComponent((trainNumber || '').trim());
    if (!clean) {
      throw new Error('Train number is required for deletion.');
    }
    let res: any;
    if (API_BASE) {
      res = await this.request<{ success?: boolean; message: string; trainId?: string }>(`/trains/${clean}`, {
        method: 'DELETE',
      });
      try {
        localFleetStore.deleteTrain(trainNumber);
      } catch {}
    } else {
      res = localFleetStore.deleteTrain(trainNumber);
    }
    deviceRegistry.detachTrain(trainNumber);
    try {
      alertNotificationService.resolveAlertsForTrain(trainNumber);
    } catch {}
    try {
      mqttService.publish('panorama/fleet/sync', { action: 'delete_train', train_number: trainNumber.trim() });
    } catch {}
    this.notifyCrossTabFleetSync();
    return res;
  }

  // Coach and Consist Management
  static async addCoach(trainNumber: string, data: CoachFormInput): Promise<any> {
    const cleanTrain = (trainNumber || '').trim();
    if (!cleanTrain) throw new Error('Train number is required.');
    let res: any;
    if (API_BASE) {
      res = await this.request(`/trains/${encodeURIComponent(cleanTrain)}/coaches`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      try {
        localFleetStore.addCoach(cleanTrain, data);
      } catch {}
    } else {
      res = localFleetStore.addCoach(cleanTrain, data);
    }
    try {
      mqttService.publish('panorama/fleet/sync', { action: 'coach_change', train_number: cleanTrain });
    } catch {}
    this.notifyCrossTabFleetSync();
    return res;
  }

  static async updateCoach(trainNumber: string, coachNumber: string, data: CoachFormInput): Promise<any> {
    const cleanTrain = (trainNumber || '').trim();
    const cleanCoach = (coachNumber || '').trim();
    if (!cleanTrain || !cleanCoach) throw new Error('Train number and Coach number are required.');
    let res: any;
    if (API_BASE) {
      res = await this.request(`/trains/${encodeURIComponent(cleanTrain)}/coaches/${encodeURIComponent(cleanCoach)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      try {
        localFleetStore.updateCoach(cleanTrain, cleanCoach, data);
      } catch {}
    } else {
      res = localFleetStore.updateCoach(cleanTrain, cleanCoach, data);
    }
    try {
      mqttService.publish('panorama/fleet/sync', { action: 'coach_change', train_number: cleanTrain });
    } catch {}
    this.notifyCrossTabFleetSync();
    return res;
  }

  static async renameCoach(trainNumber: string, oldCoachNumber: string, newCoachNumber: string): Promise<any> {
    const cleanTrain = (trainNumber || '').trim();
    const oldCoach = (oldCoachNumber || '').trim();
    const newCoach = (newCoachNumber || '').trim().toUpperCase();
    if (!cleanTrain || !oldCoach || !newCoach) throw new Error('Train number, old coach number, and new coach number are required.');
    let res: any;
    if (API_BASE) {
      res = await this.request(`/trains/${encodeURIComponent(cleanTrain)}/coaches/${encodeURIComponent(oldCoach)}/rename`, {
        method: 'PUT',
        body: JSON.stringify({ new_coach_number: newCoach }),
      });
      try {
        localFleetStore.renameCoach(cleanTrain, oldCoach, newCoach);
      } catch {}
    } else {
      res = localFleetStore.renameCoach(cleanTrain, oldCoach, newCoach);
    }
    try {
      mqttService.publish('panorama/fleet/sync', { action: 'coach_change', train_number: cleanTrain });
    } catch {}
    this.notifyCrossTabFleetSync();
    return res;
  }

  static async deleteCoach(trainNumber: string, coachNumber: string): Promise<any> {
    const cleanTrain = (trainNumber || '').trim();
    const cleanCoach = (coachNumber || '').trim();
    if (!cleanTrain || !cleanCoach) throw new Error('Train number and coach number are required.');
    let res: any;
    if (API_BASE) {
      res = await this.request(`/trains/${encodeURIComponent(cleanTrain)}/coaches/${encodeURIComponent(cleanCoach)}`, {
        method: 'DELETE',
      });
      try {
        localFleetStore.deleteCoach(cleanTrain, cleanCoach);
      } catch {}
    } else {
      res = localFleetStore.deleteCoach(cleanTrain, cleanCoach);
    }
    deviceRegistry.unassignCoachDevice(cleanTrain, cleanCoach);
    try {
      alertNotificationService.resolveAlertsForCoach(cleanTrain, cleanCoach);
    } catch {}
    try {
      mqttService.publish('panorama/fleet/sync', { action: 'coach_change', train_number: cleanTrain });
    } catch {}
    this.notifyCrossTabFleetSync();
    return res;
  }

  static async reorderCoaches(trainNumber: string, coachNumbers: string[]): Promise<any> {
    const cleanTrain = (trainNumber || '').trim();
    if (!cleanTrain) throw new Error('Train number is required.');
    let res: any;
    if (API_BASE) {
      res = await this.request(`/trains/${encodeURIComponent(cleanTrain)}/coaches/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ coach_numbers: coachNumbers }),
      });
      try {
        localFleetStore.reorderCoaches(cleanTrain, coachNumbers);
      } catch {}
    } else {
      res = localFleetStore.reorderCoaches(cleanTrain, coachNumbers);
    }
    try {
      mqttService.publish('panorama/fleet/sync', { action: 'coach_change', train_number: cleanTrain });
    } catch {}
    this.notifyCrossTabFleetSync();
    return res;
  }

  // Location and GPS Tracking
  static async fetchLocations(trainNumber?: string): Promise<TrainLocation[]> {
    if (!API_BASE) {
      const locs = localFleetStore.getTrainLocations();
      return trainNumber ? locs.filter((l) => l.train_number === trainNumber.trim()) : locs;
    }
    const query = trainNumber ? `?train_number=${encodeURIComponent(trainNumber)}` : '';
    try {
      return await this.request<TrainLocation[]>(`/location${query}`);
    } catch {
      const locs = localFleetStore.getTrainLocations();
      return trainNumber ? locs.filter((l) => l.train_number === trainNumber.trim()) : locs;
    }
  }

  static async fetchCorridorStations(trainNumber?: string): Promise<import('../types').CorridorStation[]> {
    if (!API_BASE) return [];
    const query = trainNumber ? `?train_number=${encodeURIComponent(trainNumber)}` : '';
    try {
      return await this.request<import('../types').CorridorStation[]>(`/location/corridor${query}`);
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchCorridorStations failed, returning empty list', 'fetchCorridorStations', err);
      return [];
    }
  }

  // Tanks
  static async fetchTanks(): Promise<TankLiveStatus[]> {
    if (!API_BASE) {
      return localFleetStore.listAllTanks();
    }
    try {
      const res = await this.request<TankLiveStatus[]>('/tanks');
      return Array.isArray(res) ? res : [];
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchTanks failed, falling back to local fleet tanks', 'fetchTanks', err);
      return localFleetStore.listAllTanks();
    }
  }

  static async fetchLiveTank(): Promise<TankLiveStatus | null> {
    if (!API_BASE) {
      const list = localFleetStore.listAllTanks();
      return list[0] ?? null;
    }
    try {
      return await this.request<TankLiveStatus>('/tanks/live');
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchLiveTank failed, falling back to local tank', 'fetchLiveTank', err);
      const list = localFleetStore.listAllTanks();
      return list[0] ?? null;
    }
  }

  static async updateTankGeometry(tankId: string, geometry: any): Promise<any> {
    return this.request(`/tanks/${tankId}`, {
      method: 'PUT',
      body: JSON.stringify(geometry),
    });
  }

  // Devices
  static async fetchDevices(search?: string, isOnline?: boolean): Promise<Device[]> {
    if (API_BASE) {
      try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (isOnline !== undefined) params.append('is_online', String(isOnline));
        const query = params.toString() ? `?${params.toString()}` : '';
        const remote = await this.request<Device[]>(`/devices${query}`);
        if (Array.isArray(remote) && remote.length > 0) {
          // Reconcile into local persistent registry without triggering mutation publication storms
          deviceRegistry.reconcileRemoteDevices(remote);
          return remote;
        }
      } catch {
        // Offline / GitHub Pages fallback
      }
    }

    const managed = deviceRegistry.getDevices();
    let filtered = managed;
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.uid.toLowerCase().includes(s) ||
          m.name.toLowerCase().includes(s) ||
          (m.trainNumber && m.trainNumber.toLowerCase().includes(s)) ||
          (m.coachNumber && m.coachNumber.toLowerCase().includes(s))
      );
    }
    if (isOnline !== undefined) {
      filtered = filtered.filter((m) => m.isOnline === isOnline);
    }

    return filtered.map((m) => ({
      id: m.uid,
      uid: m.uid,
      name: m.name,
      trainNumber: m.trainNumber || '',
      coachNumber: m.coachNumber || '',
      train_number: m.trainNumber || '',
      coach_number: m.coachNumber || '',
      hardwareVersion: m.hardwareModel,
      hardware_version: m.hardwareModel,
      firmwareVersion: 'v2.2.0',
      firmware_version: 'v2.2.0',
      isOnline: m.isOnline,
      is_online: m.isOnline,
      lastSeenAt: m.lastSeen,
      last_seen_at: m.lastSeen,
      lastHeartbeat: m.lastSeen,
      batteryPercent: m.batteryPercent,
      batteryVoltage: m.batteryVoltage,
      primaryLevel: m.tank1Level ?? undefined,
      secondaryLevel: m.tank2Level ?? undefined,
      hasActiveAlarm: !m.valve1Normal || !m.valve2Normal || m.batteryPercent < 20,
    }));
  }

  static async createDevice(data: DeviceCreatePayload): Promise<Device> {
    const uid = data.uid.trim();
    const trainNumber = (data.trainNumber || data.train_number || '').trim();
    const coachNumber = (data.coachNumber || data.coach_number || '').trim();
    const name = data.name.trim();

    // Record into persistent registry
    const registered = deviceRegistry.registerDevice(uid, {
      name,
      trainNumber: trainNumber || null,
      coachNumber: coachNumber || null,
      hardwareModel: data.deviceType || data.hardwareVersion || data.hardware_version || 'Quectel EC200U 4G LTE',
    });

    const payload = {
      uid,
      name,
      train_number: trainNumber,
      coach_number: coachNumber,
      hardware_version: data.hardwareVersion || data.hardware_version || 'Standard WLI Node',
      firmware_version: data.firmwareVersion || data.firmware_version || '2.0.0',
      device_type: data.deviceType || data.device_type || 'Quectel EC200U 4G LTE',
      protocol: data.protocol || 'MQTT over TLS/WSS',
      mqtt_client_id: data.mqttClientId || data.mqtt_client_id || `panorama-wli-${uid}`,
      mqtt_topic: data.mqttTopic || data.mqtt_topic || `panorama/telemetry/${uid}`,
      tank_assignment: data.tankAssignment || data.tank_assignment || 'BOTH',
      description: data.description || '',
      status: data.status || 'AVAILABLE',
    };

    try {
      mqttService.publish('panorama/devices/sync', { action: 'create_device', device: payload });
    } catch {}

    try {
      return await this.request<Device>('/devices', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (API_BASE) throw err;
      return {
        id: registered.uid,
        uid: registered.uid,
        name: registered.name,
        trainNumber: registered.trainNumber || '',
        coachNumber: registered.coachNumber || '',
        train_number: registered.trainNumber || '',
        coach_number: registered.coachNumber || '',
        hardwareVersion: registered.hardwareModel,
        hardware_version: registered.hardwareModel,
        deviceType: payload.device_type,
        protocol: payload.protocol,
        mqttClientId: payload.mqtt_client_id,
        mqttTopic: payload.mqtt_topic,
        tankAssignment: payload.tank_assignment,
        description: payload.description,
        status: payload.status,
        firmwareVersion: payload.firmware_version,
        isOnline: registered.isOnline,
        lastSeenAt: registered.lastSeen,
        batteryPercent: registered.batteryPercent,
        hasActiveAlarm: false,
      };
    }
  }

  static async updateDevice(deviceId: string, data: Partial<DeviceCreatePayload>): Promise<Device> {
    const tr = data.trainNumber || data.train_number;
    const ch = data.coachNumber || data.coach_number;
    if (tr || ch) {
      deviceRegistry.assignDevice(deviceId, tr || '', ch || '');
    }
    try {
      mqttService.publish('panorama/devices/sync', { action: 'update_device', deviceId, data });
    } catch {}
    try {
      return await this.request<Device>(`/devices/${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch {
      const dev = deviceRegistry.getDeviceByUid(deviceId);
      return {
        id: deviceId,
        uid: deviceId,
        name: dev?.name || `Node (${deviceId})`,
        trainNumber: dev?.trainNumber || '',
        coachNumber: dev?.coachNumber || '',
        train_number: dev?.trainNumber || '',
        coach_number: dev?.coachNumber || '',
        hardwareVersion: dev?.hardwareModel || 'Quectel EC200U 4G LTE',
        firmwareVersion: '2.0.0',
        isOnline: dev?.isOnline ?? true,
        lastSeenAt: dev?.lastSeen || null,
        batteryPercent: dev?.batteryPercent || 85,
        hasActiveAlarm: false,
      };
    }
  }

  static async deleteDevice(deviceId: string): Promise<any> {
    deviceRegistry.deleteDevice(deviceId);
    try {
      mqttService.publish('panorama/devices/sync', { action: 'delete_device', id: deviceId });
    } catch {}
    if (API_BASE) {
      try {
        return await this.request(`/devices/${deviceId}`, { method: 'DELETE' });
      } catch (err) {
        // If device was only registered client-side or offline
        return { success: true, id: deviceId };
      }
    }
    return { success: true, id: deviceId };
  }

  static async fetchDeviceDiagnostics(deviceId: string): Promise<DeviceDiagnostics> {
    return this.request<DeviceDiagnostics>(`/devices/${deviceId}/diagnostics`);
  }

  // Telemetry
  static async fetchTelemetryHistory(tankId?: string, range: string = '24h'): Promise<TelemetryHistory> {
    const params = new URLSearchParams({ range });
    if (tankId) params.append('tank_id', tankId);
    try {
      return await this.request<TelemetryHistory>(`/telemetry/history?${params.toString()}`);
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchTelemetryHistory failed, returning empty history', 'fetchTelemetryHistory', err);
      return {
        tank_id: tankId || 'TANK-01',
        range,
        data_points: [],
        statistics: {
          min_level: 0,
          max_level: 0,
          avg_level: 0,
          consumption_rate: 0,
          total_fills: 0,
        },
      };
    }
  }

  // Alarms
  static async fetchAlarms(status?: string): Promise<AlarmItem[]> {
    if (!API_BASE) {
      const alerts = alertNotificationService.getActiveAlerts();
      return alerts.map((a: any) => ({
        id: a.id,
        tankId: a.tankId || a.coachNumber || 'TANK-01',
        tankName: a.title || 'Water Tank',
        type: a.type || 'LEVEL',
        severity: a.severity || 'WARNING',
        message: a.message,
        value: a.data?.waterLevel ?? 0,
        threshold: 20,
        triggeredAt: a.timestamp ? new Date(a.timestamp).toISOString() : new Date().toISOString(),
        status: a.status || 'ACTIVE',
        acknowledgedBy: a.acknowledgedBy,
        acknowledgedAt: a.acknowledgedAt,
      }));
    }
    const query = status ? `?status=${status}` : '';
    try {
      return await this.request<AlarmItem[]>(`/alarms${query}`);
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchAlarms failed, falling back to alertNotificationService', 'fetchAlarms', err);
      const alerts = alertNotificationService.getActiveAlerts();
      return alerts.map((a: any) => ({
        id: a.id,
        tankId: a.tankId || a.coachNumber || 'TANK-01',
        tankName: a.title || 'Water Tank',
        type: a.type || 'LEVEL',
        severity: a.severity || 'WARNING',
        message: a.message,
        value: a.data?.waterLevel ?? 0,
        threshold: 20,
        triggeredAt: a.timestamp ? new Date(a.timestamp).toISOString() : new Date().toISOString(),
        status: a.status || 'ACTIVE',
        acknowledgedBy: a.acknowledgedBy,
        acknowledgedAt: a.acknowledgedAt,
      }));
    }
  }

  static async fetchAlarmStats(): Promise<AlarmStats> {
    if (!API_BASE) {
      const alerts = alertNotificationService.getActiveAlerts();
      const critical = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'critical').length;
      const warning = alerts.filter(a => a.severity === 'WARNING' || a.severity === 'warning').length;
      return {
        total_active: alerts.length,
        critical,
        warning,
        info: alerts.length - (critical + warning),
        acknowledged: 0,
      };
    }
    try {
      return await this.request<AlarmStats>('/alarms/stats');
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchAlarmStats failed, falling back to local alert stats', 'fetchAlarmStats', err);
      const alerts = alertNotificationService.getActiveAlerts();
      const critical = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'critical').length;
      const warning = alerts.filter(a => a.severity === 'WARNING' || a.severity === 'warning').length;
      return {
        total_active: alerts.length,
        critical,
        warning,
        info: alerts.length - (critical + warning),
        acknowledged: 0,
      };
    }
  }

  static async acknowledgeAlarm(alarmId: string, comment?: string): Promise<AlarmItem> {
    return this.request<AlarmItem>(`/alarms/${alarmId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  static async clearAlarmHistory(): Promise<{ cleared: number; message: string }> {
    return this.request<{ cleared: number; message: string }>('/alarms/clear', {
      method: 'POST',
    });
  }

  // System Health
  static async fetchHealth(): Promise<{
    status: string;
    app: string;
    version: string;
    database: string;
    mqttBroker: string;
    activeWebSockets: number;
  }> {
    if (!API_BASE) {
      return {
        status: 'nominal',
        app: 'Panorama Water Tank Monitor',
        version: 'v2.2.0',
        database: 'client-cache-active',
        mqttBroker: mqttService.isConnected() ? 'connected' : 'connecting',
        activeWebSockets: 0,
      };
    }
    try {
      return await this.request('/health');
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchHealth failed, falling back to local status', 'fetchHealth', err);
      return {
        status: 'degraded',
        app: 'Panorama Water Tank Monitor',
        version: 'v2.2.0',
        database: 'client-cache-active',
        mqttBroker: mqttService.isConnected() ? 'connected' : 'connecting',
        activeWebSockets: 0,
      };
    }
  }

  // Settings
  static async fetchSettings(): Promise<SettingItem[]> {
    try {
      return await this.request<SettingItem[]>('/settings');
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchSettings failed, returning local default settings', 'fetchSettings', err);
      return [];
    }
  }

  static async fetchUnifiedConfig(): Promise<any> {
    if (!API_BASE) {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('panorama_system_config');
        if (saved) {
          try {
            return JSON.parse(saved);
          } catch {}
        }
      }
      return {
        mqtt_broker: 'broker.hivemq.com',
        mqtt_port: 8884,
        mqtt_use_tls: true,
        mqtt_topic: '0023004D4B42501120353332',
        device_host: '192.168.4.1',
        device_port: 80,
        device_refresh_interval: 3.0,
        ubidots_host: 'https://industrial.api.ubidots.com',
        ubidots_device_label: 'wli',
        ubidots_token: 'BBUS-sample-token-live-telemetry',
        tank_shape: 'CYLINDRICAL',
        tank_height_cm: 50.0,
        tank_diameter_cm: 22.56,
        tank_capacity_liters: 20.0,
        tank_area_m2: 0.04,
        sensor_type: 'HYDROSTATIC_4_20MA',
        sensor_zero_offset_cm: 0.0,
        sensor_span_cm: 50.0,
        sensor_filter_constant_sec: 1.0,
        sensor_invert: false,
        alarm_warning_percent: 20.0,
        alarm_critical_percent: 10.0,
        alarm_overflow_percent: 100.0,
        alarm_master_enabled: true,
        alarm_low_water_enabled: true,
        alarm_sensor_fault_enabled: true,
        alarm_device_offline_enabled: true,
        alarm_modem_failure_enabled: true,
        alarm_overflow_enabled: true,
        alarm_voltage_enabled: true,
      };
    }
    try {
      return await this.request('/settings/config');
    } catch (err) {
      Logger.debug('API', 'ApiClient', 'fetchUnifiedConfig failed, returning cached or default config', 'fetchUnifiedConfig', err);
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('panorama_system_config');
        if (saved) {
          try {
            return JSON.parse(saved);
          } catch {}
        }
      }
      return {
        mqtt_broker: 'broker.hivemq.com',
        mqtt_port: 8884,
        mqtt_use_tls: true,
        mqtt_topic: '0023004D4B42501120353332',
        device_host: '192.168.4.1',
        device_port: 80,
        device_refresh_interval: 3.0,
        ubidots_host: 'https://industrial.api.ubidots.com',
        ubidots_device_label: 'wli',
        ubidots_token: 'BBUS-sample-token-live-telemetry',
        tank_shape: 'CYLINDRICAL',
        tank_height_cm: 50.0,
        tank_diameter_cm: 22.56,
        tank_capacity_liters: 20.0,
        tank_area_m2: 0.04,
        sensor_type: 'HYDROSTATIC_4_20MA',
        sensor_zero_offset_cm: 0.0,
        sensor_span_cm: 50.0,
        sensor_filter_constant_sec: 1.0,
        sensor_invert: false,
        alarm_warning_percent: 20.0,
        alarm_critical_percent: 10.0,
        alarm_overflow_percent: 100.0,
        alarm_master_enabled: true,
        alarm_low_water_enabled: true,
        alarm_sensor_fault_enabled: true,
        alarm_device_offline_enabled: true,
        alarm_modem_failure_enabled: true,
        alarm_overflow_enabled: true,
        alarm_voltage_enabled: true,
      };
    }
  }

  static async applyUnifiedConfig(config: any): Promise<any> {
    if (!API_BASE) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('panorama_system_config', JSON.stringify(config));
        window.dispatchEvent(new CustomEvent('panorama:settings-updated', { detail: config }));
      }
      try {
        mqttService.publish(CENTRAL_SETTINGS_TOPIC, config, true);
        mqttService.publish(CENTRAL_DELTA_SYNC_TOPIC, { type: 'SETTINGS_UPDATE' });
      } catch {}
      return { status: 'success', message: 'Settings saved and broadcast across clients' };
    }
    return this.request('/settings/apply', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  static async readDeviceConfig(): Promise<any> {
    return this.request('/settings/read-device', { method: 'POST' });
  }

  static async factoryResetConfig(): Promise<any> {
    return this.request('/settings/factory-reset', { method: 'POST' });
  }

  static async testDeviceConnection(): Promise<any> {
    return this.request('/settings/test-device', { method: 'POST' });
  }

  static async updateSetting(key: string, value: any): Promise<any> {
    return this.request(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  }

  static async testMqttConnection(): Promise<{ status: string; connected: boolean; broker: string; port?: number; latency_ms?: number }> {
    return this.request('/settings/test-mqtt', { method: 'POST' });
  }

  static getExportCsvUrl(tankId?: string, range: string = '24h'): string {
    if (!API_BASE) return '';
    const params = new URLSearchParams({ range });
    if (tankId) params.append('tank_id', tankId);
    return `${API_BASE}/export/csv?${params.toString()}`;
  }
}
