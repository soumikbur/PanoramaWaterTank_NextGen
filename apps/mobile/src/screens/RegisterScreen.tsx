import React, { useState } from 'react';
import { colors, typography, radii } from '../theme';
import { AuthLayout } from '../components/auth/AuthLayout';
import {
  Droplet,
  User,
  Mail,
  Phone,
  Calendar,
  Building2,
  Briefcase,
  MapPin,
  Lock,
  Eye,
  EyeOff,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { ApiClient } from '../api/client';
import { EmployeeRegistrationPayload } from '../types';

interface RegisterScreenProps {
  onBackToLogin: () => void;
}

type StepNumber = 1 | 2 | 3 | 4 | 5;

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onBackToLogin }) => {
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [submitted, setSubmitted] = useState(false);
  const [registrationResponse, setRegistrationResponse] = useState<{
    registration_id: string;
    username: string;
    message: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<EmployeeRegistrationPayload>({
    fullName: '',
    dateOfBirth: '',
    gender: '',
    email: '',
    phone: '',
    residentialAddress: '',
    employeeId: '',
    designation: 'Station Operator',
    department: 'Rolling Stock Operations',
    joiningDate: new Date().toISOString().split('T')[0],
    divisionRegion: 'Eastern Railway (Howrah)',
    assignedLocation: 'Howrah Railway Station',
    reportingManager: '',
    username: '',
    password: '',
    confirmPassword: '',
    documentName: '',
    documentData: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [certified, setCertified] = useState(false);

  // Handlers
  const updateField = (field: keyof EmployeeRegistrationPayload, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrorMessage(null);
  };

  // Password strength calculation
  const getPasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
    if (!pwd) return { score: 0, label: '', color: colors.borderStrong };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { score: 1, label: 'Weak', color: colors.critical };
    if (score <= 4) return { score: 2, label: 'Moderate', color: colors.warning };
    return { score: 3, label: 'Strong', color: colors.success };
  };

  const strength = getPasswordStrength(formData.password);

  // File Upload Handler (Optional document)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Document size must not exceed 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateField('documentName', file.name);
      updateField('documentData', reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Step Validation
  const validateCurrentStep = (): boolean => {
    setErrorMessage(null);
    if (currentStep === 1) {
      if (!formData.fullName.trim()) {
        setErrorMessage('Full name is required.');
        return false;
      }
      if (!formData.email.trim() || !formData.email.includes('@')) {
        setErrorMessage('A valid email address is required.');
        return false;
      }
      if (!formData.phone.trim() || formData.phone.length < 8) {
        setErrorMessage('A valid contact mobile number is required.');
        return false;
      }
      return true;
    }

    if (currentStep === 2) {
      if (!formData.employeeId.trim()) {
        setErrorMessage('Employee ID is required.');
        return false;
      }
      if (!formData.designation.trim()) {
        setErrorMessage('Designation is required.');
        return false;
      }
      if (!formData.department.trim()) {
        setErrorMessage('Department is required.');
        return false;
      }
      if (!formData.divisionRegion.trim()) {
        setErrorMessage('Railway Division / Region is required.');
        return false;
      }
      return true;
    }

    if (currentStep === 3) {
      if (!formData.username.trim()) {
        setErrorMessage('Username is required.');
        return false;
      }
      if (formData.password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return false;
      }
      return true;
    }

    if (currentStep === 5) {
      if (!certified) {
        setErrorMessage('Please certify that your submitted details are accurate.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setCurrentStep((prev) => Math.min(5, prev + 1) as StepNumber);
    }
  };

  const handlePrev = () => {
    setErrorMessage(null);
    setCurrentStep((prev) => Math.max(1, prev - 1) as StepNumber);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCurrentStep()) return;

    try {
      setLoading(true);
      setErrorMessage(null);

      const res = await ApiClient.registerEmployee(formData);
      setRegistrationResponse(res);
      setSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit registration. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  // Success view
  if (submitted) {
    return (
      <AuthLayout>
        <div
          className="auth-register-card auth-view-switch"
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            padding: '40px 32px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#ECFDF5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.success,
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.2)',
            }}
          >
            <CheckCircle2 size={36} strokeWidth={2.4} />
          </div>

          <h1 style={{ fontSize: '22px', fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
            Registration Submitted Successfully
          </h1>

          <p style={{ fontSize: '13px', color: colors.textSecondary, maxWidth: '440px', lineHeight: '1.5', margin: 0 }}>
            Your employee registration request has been submitted and is awaiting administrator approval.
          </p>

          <div
            style={{
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.sm,
              padding: '16px 24px',
              width: '100%',
              maxWidth: '420px',
              textAlign: 'left',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div>
              <span style={{ color: colors.textMuted }}>Registered Username: </span>
              <strong style={{ color: colors.primary }}>{registrationResponse?.username || formData.username}</strong>
            </div>
            <div>
              <span style={{ color: colors.textMuted }}>Applicant Name: </span>
              <strong>{formData.fullName}</strong>
            </div>
            <div>
              <span style={{ color: colors.textMuted }}>Employee ID: </span>
              <strong>{formData.employeeId}</strong>
            </div>
            <div>
              <span style={{ color: colors.textMuted }}>Current Status: </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  backgroundColor: '#FEF3C7',
                  color: '#92400E',
                  borderRadius: '4px',
                  fontWeight: 600,
                  fontSize: '11px',
                }}
              >
                PENDING_APPROVAL
              </span>
            </div>
          </div>

          <p style={{ fontSize: '11px', color: colors.textMuted, maxWidth: '420px', margin: 0 }}>
            Once approved by your railway division administrator, you will be able to sign in to the SCADA monitoring console using your username and password.
          </p>

          <button
            type="button"
            id="btn-back-to-login"
            onClick={onBackToLogin}
            className="auth-button"
            style={{
              marginTop: '12px',
              maxWidth: '240px',
              backgroundColor: colors.primary,
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Login</span>
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {/* Brand Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: colors.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            marginBottom: '10px',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
          }}
        >
          <Droplet size={24} strokeWidth={2.2} />
        </div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
            letterSpacing: '0.2px',
            textAlign: 'center',
          }}
        >
          Panorama Water Tank Monitor
        </h1>
        <p
          style={{
            fontSize: '11px',
            color: colors.textMuted,
            margin: '3px 0 0 0',
            fontWeight: 500,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          New Railway Employee Registration & Access Request
        </p>
      </div>

      {/* Main Registration Card */}
      <div className="auth-register-card auth-card-entrance">
        {/* Header & Back Action */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px',
            borderBottom: `1px solid ${colors.border}`,
            paddingBottom: '14px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, margin: '0 0 2px 0' }}>
              Employee Registration Wizard
            </h2>
            <span style={{ fontSize: '11px', color: colors.textSecondary }}>
              Step {currentStep} of 5 &bull; {
                currentStep === 1 ? 'Personal Information' :
                currentStep === 2 ? 'Employment Information' :
                currentStep === 3 ? 'Account Information' :
                currentStep === 4 ? 'Document Verification (Optional)' :
                'Review and Submit'
              }
            </span>
          </div>

          <button
            type="button"
            onClick={onBackToLogin}
            style={{
              background: 'none',
              border: 'none',
              color: colors.primary,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 8px',
              borderRadius: radii.sm,
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Login</span>
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '22px' }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                backgroundColor: s <= currentStep ? colors.primary : colors.border,
                transition: 'background-color 0.25s ease',
              }}
            />
          ))}
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div
            id="register-error-banner"
            className="auth-error-enter"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              backgroundColor: colors.criticalSurface,
              border: `1px solid ${colors.criticalBorder}`,
              borderRadius: radii.sm,
              marginBottom: '18px',
              color: colors.critical,
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={currentStep === 5 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
          {/* STEP 1: PERSONAL INFORMATION */}
          {currentStep === 1 && (
            <div className="tab-content-enter" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                  Full Name <span style={{ color: colors.critical }}>*</span>
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', color: colors.textPlaceholder }} />
                  <input
                    id="reg-full-name"
                    type="text"
                    className="auth-input"
                    placeholder="Enter official full name (e.g. Rajesh Kumar Sharma)"
                    value={formData.fullName}
                    onChange={(e) => updateField('fullName', e.target.value)}
                    style={{ paddingLeft: '38px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Email Address <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '12px', color: colors.textPlaceholder }} />
                    <input
                      id="reg-email"
                      type="email"
                      className="auth-input"
                      placeholder="e.g. rajesh.sharma@railways.gov"
                      value={formData.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      style={{ paddingLeft: '38px' }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Mobile Number <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Phone size={16} style={{ position: 'absolute', left: '12px', color: colors.textPlaceholder }} />
                    <input
                      id="reg-phone"
                      type="tel"
                      className="auth-input"
                      placeholder="+91-98300-12345"
                      value={formData.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      style={{ paddingLeft: '38px' }}
                      required
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Date of Birth (Optional)
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Calendar size={16} style={{ position: 'absolute', left: '12px', color: colors.textPlaceholder }} />
                    <input
                      type="date"
                      className="auth-input"
                      value={formData.dateOfBirth || ''}
                      onChange={(e) => updateField('dateOfBirth', e.target.value)}
                      style={{ paddingLeft: '38px' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Gender (Optional)
                  </label>
                  <select
                    className="auth-input"
                    value={formData.gender || ''}
                    onChange={(e) => updateField('gender', e.target.value)}
                    style={{ paddingLeft: '12px' }}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                  Residential Address (Optional)
                </label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Official railway quarter or residential address"
                  value={formData.residentialAddress || ''}
                  onChange={(e) => updateField('residentialAddress', e.target.value)}
                  style={{ paddingLeft: '12px' }}
                />
              </div>
            </div>
          )}

          {/* STEP 2: EMPLOYMENT INFORMATION */}
          {currentStep === 2 && (
            <div className="tab-content-enter" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Employee ID <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <input
                    id="reg-employee-id"
                    type="text"
                    className="auth-input"
                    placeholder="e.g. EMP-10482"
                    value={formData.employeeId}
                    onChange={(e) => updateField('employeeId', e.target.value.toUpperCase())}
                    style={{ paddingLeft: '12px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Designation <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="e.g. Senior Yard Controller"
                    value={formData.designation}
                    onChange={(e) => updateField('designation', e.target.value)}
                    style={{ paddingLeft: '12px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Department <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <select
                    className="auth-input"
                    value={formData.department}
                    onChange={(e) => updateField('department', e.target.value)}
                    style={{ paddingLeft: '12px' }}
                    required
                  >
                    <option value="Rolling Stock Operations">Rolling Stock Operations</option>
                    <option value="Signalling & Telecommunications">Signalling & Telecommunications</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                    <option value="Electrical & Traction">Electrical & Traction</option>
                    <option value="Safety & Inspections">Safety & Inspections</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Joining Date <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <input
                    type="date"
                    className="auth-input"
                    value={formData.joiningDate || ''}
                    onChange={(e) => updateField('joiningDate', e.target.value)}
                    style={{ paddingLeft: '12px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Railway Division / Region <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="e.g. Eastern Railway (Howrah)"
                    value={formData.divisionRegion}
                    onChange={(e) => updateField('divisionRegion', e.target.value)}
                    style={{ paddingLeft: '12px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Assigned Location (Optional)
                  </label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="e.g. Howrah Yard / Bardhaman"
                    value={formData.assignedLocation || ''}
                    onChange={(e) => updateField('assignedLocation', e.target.value)}
                    style={{ paddingLeft: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                  Reporting Manager (Optional)
                </label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Supervisor name or Station Master"
                  value={formData.reportingManager || ''}
                  onChange={(e) => updateField('reportingManager', e.target.value)}
                  style={{ paddingLeft: '12px' }}
                />
              </div>
            </div>
          )}

          {/* STEP 3: ACCOUNT INFORMATION */}
          {currentStep === 3 && (
            <div className="tab-content-enter" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                  Desired Username <span style={{ color: colors.critical }}>*</span>
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', color: colors.textPlaceholder }} />
                  <input
                    id="reg-username"
                    type="text"
                    className="auth-input"
                    placeholder="e.g. @rajesh.kumar or rajesh.kumar"
                    value={formData.username}
                    onChange={(e) => updateField('username', e.target.value.toLowerCase())}
                    style={{ paddingLeft: '38px' }}
                    required
                  />
                </div>
                <span style={{ fontSize: '11px', color: colors.textMuted, marginTop: '3px', display: 'block' }}>
                  Username prefix @ is automatically formatted if omitted.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Security Password <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '12px', color: colors.textPlaceholder }} />
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="Min 6 characters"
                      value={formData.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      style={{ paddingLeft: '38px', paddingRight: '36px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: colors.textMuted,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                    Confirm Password <span style={{ color: colors.critical }}>*</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '12px', color: colors.textPlaceholder }} />
                    <input
                      id="reg-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="Repeat password"
                      value={formData.confirmPassword}
                      onChange={(e) => updateField('confirmPassword', e.target.value)}
                      style={{ paddingLeft: '38px', paddingRight: '36px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((p) => !p)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: colors.textMuted,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password strength bar */}
              {formData.password && (
                <div style={{ marginTop: '-4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: colors.textMuted }}>Password Strength:</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: strength.color }}>{strength.label}</span>
                  </div>
                  <div style={{ height: '4px', backgroundColor: colors.border, borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${(strength.score / 3) * 100}%`,
                        height: '100%',
                        backgroundColor: strength.color,
                        transition: 'width 0.2s ease, background-color 0.2s ease',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: DOCUMENTS (OPTIONAL) */}
          {currentStep === 4 && (
            <div className="tab-content-enter" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  border: `2px dashed ${colors.borderStrong}`,
                  borderRadius: radii.md,
                  padding: '24px 16px',
                  textAlign: 'center',
                  backgroundColor: colors.surfaceAlt,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Upload size={32} style={{ color: colors.primary }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>
                  Upload Employee Verification Document (Optional)
                </div>
                <p style={{ fontSize: '11px', color: colors.textMuted, margin: 0, maxWidth: '360px' }}>
                  Upload Railway ID Card, Appointment Letter, or Authorized Identity Proof (PDF, PNG, JPG up to 5 MB).
                </p>

                <label
                  style={{
                    marginTop: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    backgroundColor: colors.primary,
                    color: '#FFFFFF',
                    borderRadius: radii.sm,
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <FileText size={14} />
                  <span>Choose Document File</span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                {formData.documentName && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '6px 12px',
                      backgroundColor: '#EFF6FF',
                      border: `1px solid ${colors.primaryBorder}`,
                      borderRadius: radii.sm,
                      fontSize: '12px',
                      color: colors.primary,
                      fontWeight: 600,
                    }}
                  >
                    Attached: {formData.documentName}
                  </div>
                )}
              </div>

              <div style={{ fontSize: '11px', color: colors.textMuted, lineHeight: '1.4' }}>
                Note: Document collection is optional during initial digital request. Your division supervisor can verify physical identity badges at the operational rail yard.
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW AND SUBMIT */}
          {currentStep === 5 && (
            <div className="tab-content-enter" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  backgroundColor: colors.surfaceAlt,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radii.sm,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontWeight: 700, color: colors.textPrimary, borderBottom: `1px solid ${colors.divider}`, paddingBottom: '4px' }}>
                  Personal Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div><span style={{ color: colors.textMuted }}>Name:</span> <strong>{formData.fullName}</strong></div>
                  <div><span style={{ color: colors.textMuted }}>Email:</span> <strong>{formData.email}</strong></div>
                  <div><span style={{ color: colors.textMuted }}>Phone:</span> <strong>{formData.phone}</strong></div>
                  <div><span style={{ color: colors.textMuted }}>DOB:</span> <strong>{formData.dateOfBirth || 'N/A'}</strong></div>
                </div>

                <div style={{ fontWeight: 700, color: colors.textPrimary, borderBottom: `1px solid ${colors.divider}`, paddingBottom: '4px', marginTop: '6px' }}>
                  Employment Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div><span style={{ color: colors.textMuted }}>Employee ID:</span> <strong>{formData.employeeId}</strong></div>
                  <div><span style={{ color: colors.textMuted }}>Designation:</span> <strong>{formData.designation}</strong></div>
                  <div><span style={{ color: colors.textMuted }}>Department:</span> <strong>{formData.department}</strong></div>
                  <div><span style={{ color: colors.textMuted }}>Division:</span> <strong>{formData.divisionRegion}</strong></div>
                </div>

                <div style={{ fontWeight: 700, color: colors.textPrimary, borderBottom: `1px solid ${colors.divider}`, paddingBottom: '4px', marginTop: '6px' }}>
                  Account & Credentials
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div><span style={{ color: colors.textMuted }}>Username:</span> <strong>{formData.username}</strong></div>
                  <div><span style={{ color: colors.textMuted }}>Assigned Role:</span> <strong style={{ color: colors.primary }}>EMPLOYEE</strong></div>
                  <div><span style={{ color: colors.textMuted }}>Initial Status:</span> <strong style={{ color: colors.warning }}>PENDING_APPROVAL</strong></div>
                  <div><span style={{ color: colors.textMuted }}>Document:</span> <strong>{formData.documentName || 'None Attached'}</strong></div>
                </div>
              </div>

              {/* Certification Checkbox */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '12px',
                  color: colors.textSecondary,
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginTop: '4px',
                }}
              >
                <input
                  id="chk-reg-certify"
                  type="checkbox"
                  checked={certified}
                  onChange={(e) => setCertified(e.target.checked)}
                  style={{ marginTop: '2px' }}
                />
                <span>
                  I certify that all details provided are true and accurate for authorized Eastern Railway SCADA water telemetry operations.
                </span>
              </label>
            </div>
          )}

          {/* Stepper Navigation Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                style={{
                  height: '38px',
                  padding: '0 16px',
                  backgroundColor: '#FFFFFF',
                  color: colors.textPrimary,
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radii.sm,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ArrowLeft size={14} />
                <span>Previous</span>
              </button>
            ) : <div />}

            {currentStep < 5 ? (
              <button
                type="button"
                id="btn-wizard-continue"
                onClick={handleNext}
                className="auth-button"
                style={{
                  height: '38px',
                  padding: '0 20px',
                  backgroundColor: colors.primary,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: radii.sm,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: 'auto',
                }}
              >
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="submit"
                id="btn-wizard-submit"
                disabled={loading}
                className="auth-button"
                style={{
                  height: '38px',
                  padding: '0 24px',
                  backgroundColor: loading ? colors.primaryHover : colors.success,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: radii.sm,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: 'auto',
                }}
              >
                <ShieldCheck size={16} />
                <span>{loading ? 'Submitting Application...' : 'Submit Application'}</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Footer System Info */}
      <div
        style={{
          marginTop: '18px',
          fontSize: '11px',
          color: colors.textPlaceholder,
          textAlign: 'center',
        }}
      >
        Panorama SCADA System v2.0.0 &bull; Eastern Railway Division &bull; Strictly Authorized Access
      </div>
    </AuthLayout>
  );
};
