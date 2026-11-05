/**
 * User and Authentication Data Types.
 */

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  employee_id?: string | null;
  designation?: string | null;
  department?: string | null;
  division_region?: string | null;
  role: 'ADMIN' | 'EMPLOYEE' | 'OPERATOR' | 'VIEWER' | string;
  account_status?: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | string;
  is_active: boolean;
  must_change_password?: boolean;
  joining_date?: string | null;
  last_login_at?: string | null;
  last_activity_at?: string | null;
  created_at?: string | null;
}

export interface UserActivityEvent {
  id: number;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  timestamp?: string | null;
}
