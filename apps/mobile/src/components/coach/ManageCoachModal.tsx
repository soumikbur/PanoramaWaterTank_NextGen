import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../state/AppContext';
import { CoachConsist, CoachFormInput } from '../../types';
import {
  X,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  Radio,
  Layers,
  Cpu,
  Droplets,
  Eye,
  Lock,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface ManageCoachModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainNumber?: string;
}

const COACH_CATEGORIES = [
  'AC 1st Class (1A)',
  'AC 2-Tier (2A)',
  'AC 3-Tier (3A)',
  'AC 3-Tier Economy (3E)',
  'AC Chair Car (CC)',
  'Executive Chair Car (EC)',
  'Sleeper Class (SL)',
  'Second Sitting (2S)',
  'General / Unreserved (GS)',
  'Pantry Car (PC)',
  'Luggage / Brake Van (SLR)',
  'Generator Car (EOG)',
];

export const ManageCoachModal: React.FC<ManageCoachModalProps> = ({ isOpen, onClose, trainNumber }) => {
  const {
    currentUser,
    activeConsist,
    configuredTrains,
    selectedTrainNumber,
    selectedCoachNumber,
    setSelectedCoachNumber,
    managedDevices,
    devices,
    addCoach,
    updateCoach,
    renameCoach,
    deleteCoach,
    reorderCoaches,
    refreshData,
  } = useApp();

  const isAdmin = currentUser?.role === 'ADMIN';
  const effectiveTrainNumber = (trainNumber || selectedTrainNumber || configuredTrains[0]?.train_number || '').trim();
  const matchedTrain = configuredTrains.find((t) => t.train_number === effectiveTrainNumber);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'position' | 'coach_asc' | 'coach_desc' | 'online'>('position');

  // Sub-modal states
  const [activeSubModal, setActiveSubModal] = useState<'NONE' | 'ADD' | 'EDIT' | 'RENAME' | 'DELETE'>('NONE');
  const [targetCoach, setTargetCoach] = useState<CoachConsist | null>(null);

  // Form states for Add / Edit
  const [formData, setFormData] = useState<{
    coachNumber: string;
    coachName: string;
    coachCategory: string;
    tank1Name: string;
    tank2Name: string;
    tank1Capacity: number;
    tank2Capacity: number;
    tankHeightCm: number;
    deviceUid: string;
  }>({
    coachNumber: '',
    coachName: '',
    coachCategory: 'AC 3-Tier (3A)',
    tank1Name: 'Arrival Side (Tank 1)',
    tank2Name: 'Departure Side (Tank 2)',
    tank1Capacity: 500,
    tank2Capacity: 500,
    tankHeightCm: 150,
    deviceUid: '',
  });

  // Rename form state
  const [renameValue, setRenameValue] = useState('');

  // Status & Feedback message
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear feedback after 4 seconds
  useEffect(() => {
    if (statusFeedback) {
      const timer = setTimeout(() => setStatusFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [statusFeedback]);

  // Coaches list from active consist
  const rawCoaches: CoachConsist[] = useMemo(() => {
    return activeConsist?.train_number === effectiveTrainNumber && activeConsist.coaches
      ? activeConsist.coaches
      : [];
  }, [activeConsist, effectiveTrainNumber]);

  // Filtered & Sorted Coaches
  const displayCoaches = useMemo(() => {
    let list = [...rawCoaches];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.coach_number.toLowerCase().includes(q) ||
          (c.coach_category && c.coach_category.toLowerCase().includes(q)) ||
          (c.coach_name && c.coach_name.toLowerCase().includes(q)) ||
          c.device_uid.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoryFilter !== 'ALL') {
      list = list.filter((c) => {
        const cat = (c.coach_category || '').toLowerCase();
        const filt = categoryFilter.toLowerCase();
        return cat.includes(filt) || filt.includes(cat);
      });
    }

    // Sort
    if (sortBy === 'coach_asc') {
      list.sort((a, b) => a.coach_number.localeCompare(b.coach_number, undefined, { numeric: true }));
    } else if (sortBy === 'coach_desc') {
      list.sort((a, b) => b.coach_number.localeCompare(a.coach_number, undefined, { numeric: true }));
    } else if (sortBy === 'online') {
      list.sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0));
    }
    // 'position' keeps consist order

    return list;
  }, [rawCoaches, searchQuery, categoryFilter, sortBy]);

  // List of available unassigned devices from managedDevices
  const availableDevices = useMemo(() => {
    const list = managedDevices.filter(
      (d) => d.assignmentStatus === 'AVAILABLE' || !d.trainNumber || d.trainNumber === 'UNASSIGNED'
    );
    return list;
  }, [managedDevices]);

  if (!isOpen) return null;

  // Open Add Coach Sub-modal
  const handleOpenAdd = () => {
    if (!isAdmin) {
      setStatusFeedback({ type: 'error', message: 'Administrator privileges required to add coaches.' });
      return;
    }
    // Propose next coach number (e.g. C + (length + 1))
    const nextNum = `C${rawCoaches.length + 1}`;
    setFormData({
      coachNumber: nextNum,
      coachName: `Coach ${nextNum}`,
      coachCategory: 'AC 3-Tier (3A)',
      tank1Name: 'Arrival Side (Tank 1)',
      tank2Name: 'Departure Side (Tank 2)',
      tank1Capacity: 500,
      tank2Capacity: 500,
      tankHeightCm: 150,
      deviceUid: `PANORAMA-${effectiveTrainNumber}-${nextNum}`,
    });
    setActiveSubModal('ADD');
  };

  // Open Edit Coach Sub-modal
  const handleOpenEdit = (coach: CoachConsist) => {
    if (!isAdmin) {
      setStatusFeedback({ type: 'error', message: 'Administrator privileges required to edit coaches.' });
      return;
    }
    setTargetCoach(coach);
    const t1 = coach.tanks.find((t) => t.tank_index === 1) || coach.tanks[0];
    const t2 = coach.tanks.find((t) => t.tank_index === 2) || coach.tanks[1];
    setFormData({
      coachNumber: coach.coach_number,
      coachName: coach.coach_name || `Coach ${coach.coach_number}`,
      coachCategory: coach.coach_category || 'AC 3-Tier (3A)',
      tank1Name: t1?.name || 'Arrival Side (Tank 1)',
      tank2Name: t2?.name || 'Departure Side (Tank 2)',
      tank1Capacity: t1?.capacity_liters || 500,
      tank2Capacity: t2?.capacity_liters || 500,
      tankHeightCm: 150,
      deviceUid: coach.device_uid || '',
    });
    setActiveSubModal('EDIT');
  };

  // Open Rename Coach Sub-modal
  const handleOpenRename = (coach: CoachConsist) => {
    if (!isAdmin) {
      setStatusFeedback({ type: 'error', message: 'Administrator privileges required to rename coaches.' });
      return;
    }
    setTargetCoach(coach);
    setRenameValue(coach.coach_number);
    setActiveSubModal('RENAME');
  };

  // Open Delete Coach Confirmation
  const handleOpenDelete = (coach: CoachConsist) => {
    if (!isAdmin) {
      setStatusFeedback({ type: 'error', message: 'Administrator privileges required to delete coaches.' });
      return;
    }
    setTargetCoach(coach);
    setActiveSubModal('DELETE');
  };

  // Handle Form Submit for Add Coach
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const cNum = formData.coachNumber.trim().toUpperCase();
    if (!cNum) {
      setStatusFeedback({ type: 'error', message: 'Coach identifier is required (e.g. C1, B1, S1).' });
      return;
    }

    if (rawCoaches.some((c) => c.coach_number.toUpperCase() === cNum)) {
      setStatusFeedback({ type: 'error', message: `Coach ${cNum} already exists on Train ${effectiveTrainNumber}.` });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CoachFormInput = {
        coach_number: cNum,
        coach_name: formData.coachName.trim() || `Coach ${cNum}`,
        coach_category: formData.coachCategory,
        coach_type: formData.coachCategory,
        tank_1_name: formData.tank1Name.trim() || 'Arrival Side (Tank 1)',
        tank_2_name: formData.tank2Name.trim() || 'Departure Side (Tank 2)',
        tank_1_capacity: Number(formData.tank1Capacity) || 500,
        tank_2_capacity: Number(formData.tank2Capacity) || 500,
        tank_height_cm: Number(formData.tankHeightCm) || 150,
        device_uid: formData.deviceUid.trim() || `PANORAMA-${effectiveTrainNumber}-${cNum}`,
      };

      await addCoach(effectiveTrainNumber, payload);
      setStatusFeedback({ type: 'success', message: `Coach ${cNum} added successfully to consist.` });
      setActiveSubModal('NONE');
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err?.message || 'Failed to add coach.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Form Submit for Edit Coach
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !targetCoach) return;

    setIsSubmitting(true);
    try {
      const payload: CoachFormInput = {
        coach_number: targetCoach.coach_number,
        coach_name: formData.coachName.trim(),
        coach_category: formData.coachCategory,
        coach_type: formData.coachCategory,
        tank_1_name: formData.tank1Name.trim(),
        tank_2_name: formData.tank2Name.trim(),
        tank_1_capacity: Number(formData.tank1Capacity) || 500,
        tank_2_capacity: Number(formData.tank2Capacity) || 500,
        tank_height_cm: Number(formData.tankHeightCm) || 150,
        device_uid: formData.deviceUid.trim(),
      };

      await updateCoach(effectiveTrainNumber, targetCoach.coach_number, payload);
      setStatusFeedback({ type: 'success', message: `Coach ${targetCoach.coach_number} updated successfully.` });
      setActiveSubModal('NONE');
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err?.message || 'Failed to update coach.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Form Submit for Rename Coach
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !targetCoach) return;

    const oldNum = targetCoach.coach_number.trim().toUpperCase();
    const newNum = renameValue.trim().toUpperCase();

    if (!newNum) {
      setStatusFeedback({ type: 'error', message: 'New coach identifier cannot be empty.' });
      return;
    }

    if (oldNum === newNum) {
      setActiveSubModal('NONE');
      return;
    }

    if (rawCoaches.some((c) => c.coach_number.toUpperCase() === newNum)) {
      setStatusFeedback({ type: 'error', message: `Coach ${newNum} already exists on this train.` });
      return;
    }

    setIsSubmitting(true);
    try {
      await renameCoach(effectiveTrainNumber, oldNum, newNum);
      setStatusFeedback({ type: 'success', message: `Coach ${oldNum} successfully renamed to ${newNum}.` });
      setActiveSubModal('NONE');
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err?.message || 'Failed to rename coach.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Coach
  const handleDeleteSubmit = async () => {
    if (!isAdmin || !targetCoach) return;

    setIsSubmitting(true);
    try {
      const cNum = targetCoach.coach_number;
      await deleteCoach(effectiveTrainNumber, cNum);
      setStatusFeedback({
        type: 'success',
        message: `Coach ${cNum} deleted. Assigned device released to unassigned pool.`,
      });
      setActiveSubModal('NONE');
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err?.message || 'Failed to delete coach.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Move Coach Position Up / Down in Consist
  const handleMovePosition = async (coachNumber: string, direction: 'UP' | 'DOWN') => {
    if (!isAdmin) return;

    const index = rawCoaches.findIndex((c) => c.coach_number.toUpperCase() === coachNumber.toUpperCase());
    if (index === -1) return;

    const newIndex = direction === 'UP' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rawCoaches.length) return;

    const copy = [...rawCoaches];
    const [moved] = copy.splice(index, 1);
    copy.splice(newIndex, 0, moved);

    const reorderedNumbers = copy.map((c) => c.coach_number);
    try {
      await reorderCoaches(effectiveTrainNumber, reorderedNumbers);
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err?.message || 'Failed to reorder coaches.' });
    }
  };

  // Select Coach and Navigate to details
  const handleSelectCoach = (coachNumber: string) => {
    setSelectedCoachNumber(coachNumber);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-coach-title"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1060px',
          maxHeight: '92vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #CBD5E1',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1E293B',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Layers size={18} color="#FFFFFF" />
            </div>
            <div>
              <h2
                id="manage-coach-title"
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 800,
                  letterSpacing: '0.3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>Coach Fleet &amp; Consist Management</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '4px',
                    backgroundColor: isAdmin ? '#10B981' : '#F59E0B',
                    color: '#FFFFFF',
                  }}
                >
                  {isAdmin ? 'ADMIN CONSOLE' : 'READ-ONLY (EMPLOYEE)'}
                </span>
              </h2>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                Train {effectiveTrainNumber} &bull; {matchedTrain?.name || 'Express Fleet'} &bull;{' '}
                {rawCoaches.length} Coaches Configured ({rawCoaches.length * 2} Water Tanks)
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: '#1E293B',
              color: '#94A3B8',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s ease',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Status Feedback Toast/Banner */}
        {statusFeedback && (
          <div
            style={{
              padding: '8px 16px',
              backgroundColor: statusFeedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
              borderBottom: `1px solid ${statusFeedback.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
              color: statusFeedback.type === 'success' ? '#065F46' : '#991B1B',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {statusFeedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span>{statusFeedback.message}</span>
          </div>
        )}

        {/* Read-Only Notice for Non-Admin */}
        {!isAdmin && (
          <div
            style={{
              padding: '8px 16px',
              backgroundColor: '#FFFBEB',
              borderBottom: '1px solid #FDE68A',
              color: '#92400E',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Lock size={13} />
            <span>
              <strong>Read-Only Access:</strong> You are logged in with Employee privileges. Administrator authorization
              is required to add, edit, rename, reorder, or delete coaches.
            </span>
          </div>
        )}

        {/* Toolbar: Search, Filter, Sort, Add Button */}
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          {/* Search & Filter Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            {/* Search Input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                padding: '4px 8px',
                minWidth: '220px',
              }}
            >
              <Search size={14} color="#64748B" />
              <input
                type="text"
                placeholder="Search coach, type, device..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  width: '100%',
                  color: '#0F172A',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                >
                  <X size={12} color="#94A3B8" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: '5px 8px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Categories</option>
              <option value="AC">All AC Coaches</option>
              <option value="Sleeper">Sleeper Class</option>
              <option value="Chair Car">Chair Car</option>
              <option value="General">General / Second</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: '5px 8px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <option value="position">Sort: Consist Sequence</option>
              <option value="coach_asc">Sort: Coach No. (A &rarr; Z)</option>
              <option value="coach_desc">Sort: Coach No. (Z &rarr; A)</option>
              <option value="online">Sort: Online First</option>
            </select>
          </div>

          {/* Add Coach Action */}
          <div>
            <button
              onClick={handleOpenAdd}
              disabled={!isAdmin}
              title={isAdmin ? 'Add New Coach' : 'Admin privilege required'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                backgroundColor: isAdmin ? '#2563EB' : '#94A3B8',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: isAdmin ? 'pointer' : 'not-allowed',
                boxShadow: isAdmin ? '0 1px 2px rgba(37, 99, 235, 0.2)' : 'none',
                transition: 'background-color 0.15s ease',
              }}
            >
              <Plus size={14} />
              <span>Add Coach</span>
            </button>
          </div>
        </div>

        {/* Coaches Table Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px 16px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: '0 6px',
              textAlign: 'left',
              fontSize: '12px',
            }}
          >
            <thead>
              <tr style={{ color: '#64748B', fontSize: '11px', fontWeight: 700 }}>
                <th style={{ padding: '8px 6px', width: '60px' }}>POS</th>
                <th style={{ padding: '8px 8px' }}>COACH NO.</th>
                <th style={{ padding: '8px 8px' }}>TYPE / CATEGORY</th>
                <th style={{ padding: '8px 8px' }}>TANK 1 (ARRIVAL)</th>
                <th style={{ padding: '8px 8px' }}>TANK 2 (DEPARTURE)</th>
                <th style={{ padding: '8px 8px' }}>ASSIGNED DEVICE</th>
                <th style={{ padding: '8px 8px' }}>STATUS</th>
                <th style={{ padding: '8px 8px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayCoaches.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px 16px', color: '#64748B' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>
                      No coaches matching the criteria
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>
                      {searchQuery
                        ? `No results for "${searchQuery}". Clear search to view all coaches.`
                        : 'No coaches configured for this train consist.'}
                    </div>
                  </td>
                </tr>
              ) : (
                displayCoaches.map((coach, index) => {
                  const t1 = coach.tanks.find((t) => t.tank_index === 1) || coach.tanks[0];
                  const t2 = coach.tanks.find((t) => t.tank_index === 2) || coach.tanks[1];
                  const isSelected = selectedCoachNumber?.toUpperCase() === coach.coach_number.toUpperCase();

                  return (
                    <tr
                      key={coach.coach_number}
                      style={{
                        backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                        border: isSelected ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                        borderRadius: '6px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        transition: 'background-color 0.12s ease',
                      }}
                    >
                      {/* Position & Reorder */}
                      <td style={{ padding: '8px 6px', borderTopLeftRadius: '6px', borderBottomLeftRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#64748B',
                              width: '20px',
                              textAlign: 'center',
                            }}
                          >
                            {index + 1}
                          </span>
                          {isAdmin && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <button
                                onClick={() => handleMovePosition(coach.coach_number, 'UP')}
                                disabled={index === 0}
                                title="Move Up"
                                style={{
                                  padding: '1px 3px',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: index === 0 ? 'not-allowed' : 'pointer',
                                  color: index === 0 ? '#CBD5E1' : '#475569',
                                }}
                              >
                                <ArrowUp size={10} />
                              </button>
                              <button
                                onClick={() => handleMovePosition(coach.coach_number, 'DOWN')}
                                disabled={index === rawCoaches.length - 1}
                                title="Move Down"
                                style={{
                                  padding: '1px 3px',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: index === rawCoaches.length - 1 ? 'not-allowed' : 'pointer',
                                  color: index === rawCoaches.length - 1 ? '#CBD5E1' : '#475569',
                                }}
                              >
                                <ArrowDown size={10} />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Coach Number */}
                      <td style={{ padding: '8px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              backgroundColor: '#2563EB',
                              color: '#FFFFFF',
                              fontWeight: 800,
                              fontSize: '11.5px',
                            }}
                          >
                            {coach.coach_number}
                          </span>
                          {coach.coach_name && coach.coach_name !== `Coach ${coach.coach_number}` && (
                            <span style={{ fontSize: '11px', color: '#475569' }}>{coach.coach_name}</span>
                          )}
                        </div>
                      </td>

                      {/* Coach Type */}
                      <td style={{ padding: '8px 8px', color: '#334155', fontWeight: 600 }}>
                        {coach.coach_category || coach.coach_type || 'AC 3-Tier'}
                      </td>

                      {/* Tank 1 */}
                      <td style={{ padding: '8px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Droplets size={12} color="#2563EB" />
                          <div>
                            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '11px' }}>
                              {t1?.name || 'Tank 1'}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748B' }}>
                              {t1?.capacity_liters || 500} L &bull; {t1?.current_level_percent ?? 0}%
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Tank 2 */}
                      <td style={{ padding: '8px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Droplets size={12} color="#0D9488" />
                          <div>
                            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '11px' }}>
                              {t2?.name || 'Tank 2'}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748B' }}>
                              {t2?.capacity_liters || 500} L &bull; {t2?.current_level_percent ?? 0}%
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Assigned Device */}
                      <td style={{ padding: '8px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Cpu size={12} color="#475569" />
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              backgroundColor: '#F1F5F9',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              color: '#1E293B',
                            }}
                          >
                            {coach.device_uid || 'PANORAMA-AUTO'}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '8px 8px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            backgroundColor: coach.is_online ? '#DCFCE7' : '#F1F5F9',
                            color: coach.is_online ? '#15803D' : '#64748B',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: coach.is_online ? '#16A34A' : '#94A3B8',
                            }}
                          />
                          {coach.is_online ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td
                        style={{
                          padding: '8px 8px',
                          textAlign: 'right',
                          borderTopRightRadius: '6px',
                          borderBottomRightRadius: '6px',
                        }}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {/* View Details / Select */}
                          <button
                            onClick={() => handleSelectCoach(coach.coach_number)}
                            title="View Coach Details"
                            style={{
                              padding: '4px 7px',
                              backgroundColor: isSelected ? '#2563EB' : '#F1F5F9',
                              color: isSelected ? '#FFFFFF' : '#334155',
                              border: '1px solid #CBD5E1',
                              borderRadius: '4px',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <Eye size={12} />
                            <span>{isSelected ? 'Viewing' : 'View'}</span>
                          </button>

                          {/* Rename */}
                          <button
                            onClick={() => handleOpenRename(coach)}
                            disabled={!isAdmin}
                            title={isAdmin ? 'Rename Coach' : 'Admin only'}
                            style={{
                              padding: '4px 6px',
                              backgroundColor: '#FFFFFF',
                              color: isAdmin ? '#475569' : '#94A3B8',
                              border: '1px solid #CBD5E1',
                              borderRadius: '4px',
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              fontSize: '10.5px',
                            }}
                          >
                            <Edit2 size={11} />
                            <span>Rename</span>
                          </button>

                          {/* Edit Config */}
                          <button
                            onClick={() => handleOpenEdit(coach)}
                            disabled={!isAdmin}
                            title={isAdmin ? 'Edit Coach Parameters' : 'Admin only'}
                            style={{
                              padding: '4px 6px',
                              backgroundColor: '#FFFFFF',
                              color: isAdmin ? '#2563EB' : '#94A3B8',
                              border: '1px solid #CBD5E1',
                              borderRadius: '4px',
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              fontSize: '10.5px',
                            }}
                          >
                            <span>Edit</span>
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleOpenDelete(coach)}
                            disabled={!isAdmin}
                            title={isAdmin ? 'Delete Coach' : 'Admin only'}
                            style={{
                              padding: '4px 6px',
                              backgroundColor: '#FFFFFF',
                              color: isAdmin ? '#DC2626' : '#94A3B8',
                              border: '1px solid #CBD5E1',
                              borderRadius: '4px',
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748B',
          }}
        >
          <div>
            Showing {displayCoaches.length} of {rawCoaches.length} coaches &bull; Train {effectiveTrainNumber}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#334155',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close Panel
          </button>
        </div>
      </div>

      {/* SUB-MODAL: Add Coach / Edit Coach */}
      {(activeSubModal === 'ADD' || activeSubModal === 'EDIT') && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              border: '1px solid #CBD5E1',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#1E293B',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                {activeSubModal === 'ADD' ? 'Add New Coach to Consist' : `Edit Coach ${targetCoach?.coach_number}`}
              </h3>
              <button
                onClick={() => setActiveSubModal('NONE')}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={activeSubModal === 'ADD' ? handleAddSubmit : handleEditSubmit} style={{ padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Coach Identifier *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={activeSubModal === 'EDIT'}
                    placeholder="e.g. C1, B1, S4"
                    value={formData.coachNumber}
                    onChange={(e) => setFormData({ ...formData, coachNumber: e.target.value.toUpperCase() })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      backgroundColor: activeSubModal === 'EDIT' ? '#F1F5F9' : '#FFFFFF',
                    }}
                  />
                  {activeSubModal === 'EDIT' && (
                    <span style={{ fontSize: '10px', color: '#64748B' }}>To change number, use Rename action.</span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Coach Category / Type *
                  </label>
                  <select
                    value={formData.coachCategory}
                    onChange={(e) => setFormData({ ...formData, coachCategory: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    {COACH_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tank 1 Configuration */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  padding: '10px',
                  marginBottom: '10px',
                }}
              >
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
                  Tank 1: Arrival Side (Primary)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.tank1Name}
                      onChange={(e) => setFormData({ ...formData, tank1Name: e.target.value })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Capacity (L)
                    </label>
                    <input
                      type="number"
                      min={100}
                      max={5000}
                      value={formData.tank1Capacity}
                      onChange={(e) => setFormData({ ...formData, tank1Capacity: parseInt(e.target.value, 10) || 500 })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Tank 2 Configuration */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  padding: '10px',
                  marginBottom: '10px',
                }}
              >
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
                  Tank 2: Departure Side (Secondary)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.tank2Name}
                      onChange={(e) => setFormData({ ...formData, tank2Name: e.target.value })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Capacity (L)
                    </label>
                    <input
                      type="number"
                      min={100}
                      max={5000}
                      value={formData.tank2Capacity}
                      onChange={(e) => setFormData({ ...formData, tank2Capacity: parseInt(e.target.value, 10) || 500 })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Device Assignment */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Assigned Hardware Device UID
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder={`PANORAMA-${effectiveTrainNumber}-${formData.coachNumber || 'C1'}`}
                    value={formData.deviceUid}
                    onChange={(e) => setFormData({ ...formData, deviceUid: e.target.value.toUpperCase() })}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      fontSize: '11.5px',
                      fontFamily: 'monospace',
                    }}
                  />
                  {availableDevices.length > 0 && (
                    <select
                      onChange={(e) => e.target.value && setFormData({ ...formData, deviceUid: e.target.value })}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '5px',
                        border: '1px solid #CBD5E1',
                        fontSize: '11px',
                        color: '#334155',
                      }}
                    >
                      <option value="">Choose Unassigned Node</option>
                      {availableDevices.map((d) => (
                        <option key={d.uid} value={d.uid}>
                          {d.uid} ({d.hardwareModel})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '3px' }}>
                  MQTT Telemetry Topic: <code>0023004D4B42501120353332</code> (UID matching device header)
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveSubModal('NONE')}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '6px 16px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? 'Saving...' : activeSubModal === 'ADD' ? 'Add Coach' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL: Rename Coach Dialog */}
      {activeSubModal === 'RENAME' && targetCoach && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              border: '1px solid #CBD5E1',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#1E293B',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                Rename Coach {targetCoach.coach_number}
              </h3>
              <button
                onClick={() => setActiveSubModal('NONE')}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} style={{ padding: '16px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                Renaming will update the coach consist identifier, tank bindings, and device mappings across all
                monitoring dashboards. Historical telemetry data is preserved.
              </p>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  New Coach Identifier *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. H1, A1, B2"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveSubModal('NONE')}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '6px 16px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? 'Renaming...' : 'Rename Coach'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL: Delete Coach Confirmation Dialog */}
      {activeSubModal === 'DELETE' && targetCoach && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              border: '1px solid #FECACA',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={16} />
                <span>Confirm Coach Deletion</span>
              </h3>
              <button
                onClick={() => setActiveSubModal('NONE')}
                style={{ background: 'transparent', border: 'none', color: '#FEE2E2', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#1E293B', fontWeight: 600 }}>
                Are you sure you want to remove Coach {targetCoach.coach_number} from Train {effectiveTrainNumber}?
              </p>

              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '11.5px',
                  color: '#991B1B',
                  lineHeight: 1.5,
                  marginBottom: '16px',
                }}
              >
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  <li>Both Arrival &amp; Departure water tanks will be removed from active SCADA monitoring.</li>
                  <li>
                    Assigned Device (<code>{targetCoach.device_uid}</code>) will be returned to the unassigned hardware
                    pool.
                  </li>
                  <li>Historical telemetry and alarm audit logs are preserved and will not be destroyed.</li>
                </ul>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveSubModal('NONE')}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSubmit}
                  disabled={isSubmitting}
                  style={{
                    padding: '6px 16px',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? 'Deleting...' : `Delete Coach ${targetCoach.coach_number}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
