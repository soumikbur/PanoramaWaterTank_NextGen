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
  TrainLocation
} from '../types';

const API_BASE =
  (typeof process !== 'undefined' && (process.env?.API_URL || process.env?.REACT_APP_API_URL || process.env?.VITE_API_URL)) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  (typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/api/v1` : 'http://127.0.0.1:8000/api/v1');

export class ApiClient {
  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const token = localStorage.getItem('panorama_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let errorMsg = `API error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson.detail) errorMsg = errorJson.detail;
      } catch {}
      throw new Error(errorMsg);
    }
    return response.json() as Promise<T>;
  }

  // Auth
  static async login(username: string, password: string): Promise<{ access_token: string; user: UserProfile; must_change_password?: boolean }> {
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
  }

  static async fetchCurrentUser(): Promise<UserProfile> {
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
    localStorage.removeItem('panorama_token');
  }

  // Users & Employee Management
  static async fetchUsers(params?: {
    search?: string;
    department?: string;
    designation?: string;
    account_status?: string;
    role?: string;
  }): Promise<UserProfile[]> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.department) query.append('department', params.department);
    if (params?.designation) query.append('designation', params.designation);
    if (params?.account_status) query.append('account_status', params.account_status);
    if (params?.role) query.append('role', params.role);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const list = await this.request<any[]>(`/users${queryString}`);
    if (!Array.isArray(list)) return [];
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
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    const list = await this.request<any[]>(`/users/registrations${queryString}`);
    if (!Array.isArray(list)) return [];
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
  }

  static async getRegistrationDetail(regId: string): Promise<UserProfile> {
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
    return this.request<RegionSummary[]>('/trains/regions');
  }

  static async fetchTrains(region?: string, search?: string): Promise<TrainOverviewItem[]> {
    const params = new URLSearchParams();
    if (region) params.append('region', region);
    if (search) params.append('search', search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<TrainOverviewItem[]>(`/trains${query}`);
  }

  static async fetchTrainConsist(trainNumber: string): Promise<TrainConsist> {
    return this.request<TrainConsist>(`/trains/${trainNumber}/consist`);
  }

  static async createTrain(data: { train_number: string; name: string; region: string; coach_number?: string; tank_capacity?: number }): Promise<any> {
    return this.request('/trains', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateTrain(trainNumber: string, data: { name?: string; region?: string; type?: string }): Promise<any> {
    return this.request(`/trains/${trainNumber}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  static async deleteTrain(trainNumber: string): Promise<any> {
    return this.request(`/trains/${trainNumber}`, {
      method: 'DELETE',
    });
  }

  // Location and GPS Tracking
  static async fetchLocations(trainNumber?: string): Promise<TrainLocation[]> {
    const query = trainNumber ? `?train_number=${trainNumber}` : '';
    return this.request<TrainLocation[]>(`/location${query}`);
  }

  static async fetchCorridorStations(): Promise<import('../types').CorridorStation[]> {
    return this.request<import('../types').CorridorStation[]>('/location/corridor');
  }

  // Tanks
  static async fetchTanks(): Promise<TankLiveStatus[]> {
    return this.request<TankLiveStatus[]>('/tanks');
  }

  static async fetchLiveTank(): Promise<TankLiveStatus> {
    return this.request<TankLiveStatus>('/tanks/live');
  }

  static async updateTankGeometry(tankId: string, geometry: any): Promise<any> {
    return this.request(`/tanks/${tankId}`, {
      method: 'PUT',
      body: JSON.stringify(geometry),
    });
  }

  // Devices
  static async fetchDevices(search?: string, isOnline?: boolean): Promise<Device[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (isOnline !== undefined) params.append('is_online', String(isOnline));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<Device[]>(`/devices${query}`);
  }

  static async createDevice(data: { uid: string; train_number: string; coach_number: string; name: string; hardware_version?: string; firmware_version?: string }): Promise<Device> {
    return this.request<Device>('/devices', {
      method: 'POST',
      body: JSON.stringify({
        uid: data.uid,
        train_number: data.train_number,
        coach_number: data.coach_number,
        name: data.name,
        hardware_version: data.hardware_version,
        firmware_version: data.firmware_version,
      }),
    });
  }

  static async updateDevice(deviceId: string, data: { name?: string; trainNumber?: string; coachNumber?: string; firmwareVersion?: string }): Promise<Device> {
    return this.request<Device>(`/devices/${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  static async deleteDevice(deviceId: string): Promise<any> {
    return this.request(`/devices/${deviceId}`, {
      method: 'DELETE',
    });
  }

  static async fetchDeviceDiagnostics(deviceId: string): Promise<DeviceDiagnostics> {
    return this.request<DeviceDiagnostics>(`/devices/${deviceId}/diagnostics`);
  }

  // Telemetry
  static async fetchTelemetryHistory(tankId?: string, range: string = '24h'): Promise<TelemetryHistory> {
    const params = new URLSearchParams({ range });
    if (tankId) params.append('tank_id', tankId);
    return this.request<TelemetryHistory>(`/telemetry/history?${params.toString()}`);
  }

  // Alarms
  static async fetchAlarms(status?: string): Promise<AlarmItem[]> {
    const query = status ? `?status=${status}` : '';
    return this.request<AlarmItem[]>(`/alarms${query}`);
  }

  static async fetchAlarmStats(): Promise<AlarmStats> {
    return this.request<AlarmStats>('/alarms/stats');
  }

  static async acknowledgeAlarm(alarmId: string, comment?: string): Promise<AlarmItem> {
    return this.request<AlarmItem>(`/alarms/${alarmId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  // Settings
  static async fetchSettings(): Promise<SettingItem[]> {
    return this.request<SettingItem[]>('/settings');
  }

  static async fetchUnifiedConfig(): Promise<any> {
    return this.request('/settings/config');
  }

  static async applyUnifiedConfig(config: any): Promise<any> {
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
    const params = new URLSearchParams({ range });
    if (tankId) params.append('tank_id', tankId);
    return `${API_BASE}/export/csv?${params.toString()}`;
  }
}
