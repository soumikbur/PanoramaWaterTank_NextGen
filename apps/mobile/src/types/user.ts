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
  account_status?: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'PENDING_APPROVAL' | 'REJECTED' | string;
  is_active: boolean;
  must_change_password?: boolean;
  joining_date?: string | null;
  last_login_at?: string | null;
  last_activity_at?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  residential_address?: string | null;
  assigned_location?: string | null;
  reporting_manager?: string | null;
  document_name?: string | null;
  document_url?: string | null;
  registration_date?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
}

export interface EmployeeRegistrationPayload {
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  email: string;
  phone: string;
  residentialAddress?: string;
  employeeId: string;
  designation: string;
  department: string;
  joiningDate?: string;
  divisionRegion: string;
  assignedLocation?: string;
  reportingManager?: string;
  username: string;
  password: string;
  confirmPassword: string;
  documentName?: string;
  documentData?: string;
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
