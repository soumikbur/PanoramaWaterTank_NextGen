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
  TrainLocation
} from '../types';

const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && (process.env?.VITE_API_URL || process.env?.REACT_APP_API_URL)) ||
  'http://127.0.0.1:8000/api/v1';

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
  static async login(username: string, password: string): Promise<{ access_token: string; user: UserProfile }> {
    const res = await this.request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (res.access_token) {
      localStorage.setItem('panorama_token', res.access_token);
    }
    return res;
  }

  static async fetchCurrentUser(): Promise<UserProfile> {
    const res = await this.request<any>('/auth/me');
    return {
      id: res.id,
      username: res.username,
      full_name: res.fullName || res.full_name,
      email: res.email,
      role: res.role,
      is_active: res.isActive ?? res.is_active ?? true,
    };
  }

  static logout(): void {
    localStorage.removeItem('panorama_token');
  }

  // Users Management
  static async fetchUsers(): Promise<UserProfile[]> {
    const list = await this.request<any[]>('/users');
    return list.map((u) => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name || u.fullName,
      email: u.email,
      role: u.role,
      is_active: u.is_active ?? u.isActive ?? true,
    }));
  }

  static async createUser(user: { username: string; password: string; full_name: string; email?: string; role: string }): Promise<UserProfile> {
    return this.request<UserProfile>('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  static async deleteUser(userId: string): Promise<void> {
    await this.request(`/users/${userId}`, { method: 'DELETE' });
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

  // Tanks
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
