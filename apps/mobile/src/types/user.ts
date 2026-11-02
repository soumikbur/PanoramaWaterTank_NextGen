/**
 * User and Authentication Data Types.
 */

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email?: string | null;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER' | string;
  is_active: boolean;
}

