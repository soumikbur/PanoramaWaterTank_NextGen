import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  ArrowLeft,
  RefreshCw,
  Sliders,
  GripVertical,
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
    tank1HeightCm: number;
    tank2HeightCm: number;
    tank1Geometry: 'CYLINDRICAL' | 'RECTANGULAR';
    tank2Geometry: 'CYLINDRICAL' | 'RECTANGULAR';
    deviceUid: string;
  }>({
    coachNumber: '',
    coachName: '',
    coachCategory: 'AC 3-Tier (3A)',
    tank1Name: 'Arrival Side (Tank 1)',
    tank2Name: 'Departure Side (Tank 2)',
    tank1Capacity: 500,
    tank2Capacity: 500,
    tank1HeightCm: 50,
    tank2HeightCm: 50,
    tank1Geometry: 'CYLINDRICAL',
    tank2Geometry: 'CYLINDRICAL',
    deviceUid: '',
  });

  // Rename form state
  const [renameValue, setRenameValue] = useState('');

  // Status & Feedback message
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Drag-and-Drop Reordering state
  const [draggedCoachNumber, setDraggedCoachNumber] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isReordering, setIsReordering] = useState(false);

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

  // Deduplicated registered devices across managedDevices and devices
  const allKnownDevices = useMemo(() => {
    const map = new Map<string, {
      uid: string;
      isOnline: boolean;
      trainNumber: string | null;
      coachNumber: string | null;
      hardwareModel: string;
      name: string;
    }>();

    for (const d of managedDevices) {
      if (d.uid) {
        map.set(d.uid.toUpperCase(), {
          uid: d.uid.toUpperCase(),
          isOnline: !!d.isOnline,
          trainNumber: d.trainNumber || null,
          coachNumber: d.coachNumber || null,
          hardwareModel: d.hardwareModel || 'WLI Node',
          name: d.name || `Node ${d.uid.slice(-6)}`,
        });
      }
    }

    for (const d of devices) {
      const u = (d.uid || '').toUpperCase();
      if (u && !map.has(u)) {
        map.set(u, {
          uid: u,
          isOnline: !!(d.isOnline ?? (d as any).is_online),
          trainNumber: d.trainNumber || (d as any).train_number || null,
          coachNumber: d.coachNumber || (d as any).coach_number || null,
          hardwareModel: d.hardwareVersion || (d as any).hardware_version || 'WLI Node',
          name: d.name || `Node ${u.slice(-6)}`,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.uid.localeCompare(b.uid));
  }, [managedDevices, devices]);

  const selectedDeviceObj = useMemo(() => {
    const curUid = formData.deviceUid.trim().toUpperCase();
    if (!curUid) return null;
    return allKnownDevices.find((d) => d.uid === curUid) || null;
  }, [allKnownDevices, formData.deviceUid]);

  const isAssignedToOtherCoach = useMemo(() => {
    if (!selectedDeviceObj) return false;
    const devTrain = (selectedDeviceObj.trainNumber || '').trim();
    const devCoach = (selectedDeviceObj.coachNumber || '').trim().toUpperCase();
    if (!devTrain || !devCoach || devTrain === 'UNASSIGNED' || devCoach === 'UNASSIGNED') {
      return false;
    }
    if (activeSubModal === 'EDIT' && targetCoach) {
      if (devTrain === effectiveTrainNumber && devCoach === targetCoach.coach_number.toUpperCase()) {
        return false;
      }
    }
    return true;
  }, [selectedDeviceObj, activeSubModal, targetCoach, effectiveTrainNumber]);

  // List of available unassigned devices from managedDevices
  const availableDevices = useMemo(() => {
    return allKnownDevices.filter(
      (d) => !d.trainNumber || d.trainNumber === 'UNASSIGNED' || !d.coachNumber || d.coachNumber === 'UNASSIGNED'
    );
  }, [allKnownDevices]);

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
      tank1HeightCm: 50,
      tank2HeightCm: 50,
      tank1Geometry: 'CYLINDRICAL',
      tank2Geometry: 'CYLINDRICAL',
      deviceUid: '',
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
    const h1 = t1?.height_cm || 50;
    const h2 = t2?.height_cm || 50;
    const geom1 = (t1?.geometry || t1?.tank_type || 'CYLINDRICAL').toUpperCase() === 'RECTANGULAR' ? 'RECTANGULAR' : 'CYLINDRICAL';
    const geom2 = (t2?.geometry || t2?.tank_type || 'CYLINDRICAL').toUpperCase() === 'RECTANGULAR' ? 'RECTANGULAR' : 'CYLINDRICAL';
    const cap1 = t1?.capacity_liters || 500;
    const cap2 = t2?.capacity_liters || 500;

    setFormData({
      coachNumber: coach.coach_number,
      coachName: coach.coach_name || `Coach ${coach.coach_number}`,
      coachCategory: coach.coach_category || 'AC 3-Tier (3A)',
      tank1Name: t1?.name || 'Arrival Side (Tank 1)',
      tank2Name: t2?.name || 'Departure Side (Tank 2)',
      tank1Capacity: cap1,
      tank2Capacity: cap2,
      tank1HeightCm: h1,
      tank2HeightCm: h2,
      tank1Geometry: geom1,
      tank2Geometry: geom2,
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
        tank_1_height_cm: Number(formData.tank1HeightCm) || 50,
        tank_2_height_cm: Number(formData.tank2HeightCm) || 50,
        tank_1_geometry: formData.tank1Geometry,
        tank_2_geometry: formData.tank2Geometry,
        device_uid: formData.deviceUid.trim(),
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
        tank_1_height_cm: Number(formData.tank1HeightCm) || 50,
        tank_2_height_cm: Number(formData.tank2HeightCm) || 50,
        tank_1_geometry: formData.tank1Geometry,
        tank_2_geometry: formData.tank2Geometry,
        device_uid: formData.deviceUid.trim(),
      };

      await updateCoach(effectiveTrainNumber, targetCoach.coach_number, payload);
      await refreshData();
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

  // Execute coach sequence reordering with backend persistence & real-time sync
  const executeReorder = async (coachNumber: string, targetIndex: number) => {
    if (!isAdmin || isReordering) return;
    const cleanNum = coachNumber.trim().toUpperCase();
    const sourceIndex = rawCoaches.findIndex(
      (c) => c.coach_number.toUpperCase() === cleanNum
    );

    if (
      sourceIndex === -1 ||
      targetIndex < 0 ||
      targetIndex >= rawCoaches.length ||
      sourceIndex === targetIndex
    ) {
      setDraggedCoachNumber(null);
      setDragOverIndex(null);
      return;
    }

    const copy = [...rawCoaches];
    const [moved] = copy.splice(sourceIndex, 1);
    copy.splice(targetIndex, 0, moved);

    const reorderedNumbers = copy.map((c) => c.coach_number);
    setDraggedCoachNumber(null);
    setDragOverIndex(null);
    setIsReordering(true);

    try {
      await reorderCoaches(effectiveTrainNumber, reorderedNumbers);
      setStatusFeedback({
        type: 'success',
        message: `Coach ${cleanNum} reordered to position ${targetIndex + 1} of ${copy.length}.`,
      });
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err?.message || 'Failed to reorder coaches.',
      });
    } finally {
      setIsReordering(false);
    }
  };

  // HTML5 Drag Events for Desktop Mouse
  const handleDragStart = (e: React.DragEvent, coachNumber: string) => {
    if (!isAdmin) {
      e.preventDefault();
      return;
    }
    setDraggedCoachNumber(coachNumber);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', coachNumber);
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    if (!isAdmin || !draggedCoachNumber) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== targetIndex) {
      setDragOverIndex(targetIndex);
    }
  };

  const handleDragEnd = () => {
    setDraggedCoachNumber(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!isAdmin || !draggedCoachNumber) return;
    executeReorder(draggedCoachNumber, targetIndex);
  };

  // Touch Events for Mobile Web and Capacitor Android touchscreens
  const handleTouchStart = (coachNumber: string, index: number) => {
    if (!isAdmin) return;
    setDraggedCoachNumber(coachNumber);
    setDragOverIndex(index);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isAdmin || !draggedCoachNumber) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = elem?.closest('tr[data-coach-index]');
    if (row) {
      const idx = parseInt(row.getAttribute('data-coach-index') || '-1', 10);
      if (idx >= 0 && idx < rawCoaches.length && idx !== dragOverIndex) {
        setDragOverIndex(idx);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isAdmin || !draggedCoachNumber) {
      setDraggedCoachNumber(null);
      setDragOverIndex(null);
      return;
    }
    if (dragOverIndex !== null) {
      executeReorder(draggedCoachNumber, dragOverIndex);
    } else {
      setDraggedCoachNumber(null);
      setDragOverIndex(null);
    }
  };

  // Backwards compatibility helper
  const handleMovePosition = async (coachNumber: string, direction: 'UP' | 'DOWN') => {
    if (!isAdmin) return;
    const index = rawCoaches.findIndex((c) => c.coach_number.toUpperCase() === coachNumber.toUpperCase());
    if (index === -1) return;
    const newIndex = direction === 'UP' ? index - 1 : index + 1;
    executeReorder(coachNumber, newIndex);
  };

  // Select Coach and Navigate to details
  const handleSelectCoach = (coachNumber: string) => {
    setSelectedCoachNumber(coachNumber);
    onClose();
  };

  const modalContent = (
    <div
      data-testid="manage-coach-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-coach-title"
    >
      <div
        data-testid="manage-coach-container"
        style={{
          width: 'min(1200px, 96vw)',
          maxHeight: 'calc(100vh - 40px)',
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #CBD5E1',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header (Sticky - Restored Light SCADA Theme) */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Layers size={20} color="#2563EB" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2
                  id="manage-coach-title"
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 800,
                    letterSpacing: '0.2px',
                    color: '#0F172A',
                  }}
                >
                  Coach Fleet &amp; Consist Editing
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: isAdmin ? '#DCFCE7' : '#FEF3C7',
                    color: isAdmin ? '#15803D' : '#B45309',
                    border: `1px solid ${isAdmin ? '#86EFAC' : '#FCD34D'}`,
                    letterSpacing: '0.4px',
                  }}
                >
                  {isAdmin ? 'ADMIN CONSOLE' : 'READ-ONLY (EMPLOYEE)'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px', fontSize: '12px' }}>
                <span style={{ fontWeight: 700, color: '#2563EB' }}>
                  Train {effectiveTrainNumber}
                </span>
                <span style={{ color: '#CBD5E1' }}>&bull;</span>
                <span style={{ color: '#475569', fontWeight: 600 }}>
                  {matchedTrain?.name || 'Express Fleet'}
                </span>
                <span style={{ color: '#CBD5E1' }}>&bull;</span>
                <span
                  style={{
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: '1px solid #BFDBFE',
                  }}
                >
                  {rawCoaches.length} Coaches Configured
                </span>
                <span
                  style={{
                    backgroundColor: '#F0FDFA',
                    color: '#0F766E',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: '1px solid #99F6E4',
                  }}
                >
                  {rawCoaches.length * 2} Water Tanks
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              aria-label="Back to Train Details"
              title="Back to Train Details"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#F8FAFC',
                color: '#475569',
                border: '1px solid #CBD5E1',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                transition: 'background-color 0.15s ease',
              }}
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>

            <button
              onClick={onClose}
              aria-label="Close"
              title="Close Coach Editing Panel"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                backgroundColor: '#F8FAFC',
                color: '#64748B',
                border: '1px solid #E2E8F0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Feedback Toast/Banner */}
        {statusFeedback && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: statusFeedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
              borderBottom: `1px solid ${statusFeedback.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
              color: statusFeedback.type === 'success' ? '#065F46' : '#991B1B',
              fontSize: '12.5px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            {statusFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{statusFeedback.message}</span>
          </div>
        )}

        {/* Read-Only Notice for Non-Admin */}
        {!isAdmin && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: '#FFFBEB',
              borderBottom: '1px solid #FDE68A',
              color: '#92400E',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            <Lock size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>Read-Only Access:</strong> You are logged in with Employee privileges. Administrator authorization
              is required to add, edit, rename, reorder, or delete coaches.
            </span>
          </div>
        )}

        {/* Toolbar: Search, Filter, Sort, Add Button (Sticky) */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          {/* Search & Filter Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
            {/* Search Input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                padding: '0 10px',
                height: '36px',
                minWidth: '240px',
                flex: '0 1 280px',
              }}
            >
              <Search size={16} color="#64748B" />
              <input
                type="text"
                placeholder="Search coach, type, device..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '12.5px',
                  width: '100%',
                  color: '#0F172A',
                  backgroundColor: 'transparent',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <X size={14} color="#94A3B8" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                height: '36px',
                padding: '0 10px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Categories</option>
              <option value="AC">All AC Coaches</option>
              <option value="Sleeper">Sleeper Class (SL)</option>
              <option value="Chair Car">Chair Car (CC / EC)</option>
              <option value="General">General / Second (GS / 2S)</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                height: '36px',
                padding: '0 10px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '12px',
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
              title={isAdmin ? 'Add New Coach to Consist' : 'Administrator authorization required to add coaches'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '36px',
                padding: '0 14px',
                backgroundColor: isAdmin ? '#2563EB' : '#94A3B8',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isAdmin ? 'pointer' : 'not-allowed',
                boxShadow: isAdmin ? '0 1px 3px rgba(37, 99, 235, 0.25)' : 'none',
                transition: 'background-color 0.15s ease',
              }}
            >
              <Plus size={16} />
              <span>Add Coach</span>
            </button>
          </div>
        </div>

        {/* Coaches Table Content (Independently scrollable) */}
        <div
          className="coach-table-scroll-container"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'auto',
            padding: '12px 20px 20px 20px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <style>{`
            .coach-table-scroll-container::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            .coach-table-scroll-container::-webkit-scrollbar-track {
              background: #F1F5F9;
              border-radius: 4px;
            }
            .coach-table-scroll-container::-webkit-scrollbar-thumb {
              background: #94A3B8;
              border-radius: 4px;
            }
            .coach-table-scroll-container::-webkit-scrollbar-thumb:hover {
              background: #64748B;
            }
          `}</style>

          <table
            style={{
              width: '100%',
              minWidth: '1100px',
              borderCollapse: 'separate',
              borderSpacing: '0 8px',
              textAlign: 'left',
              fontSize: '12.5px',
            }}
          >
            <thead>
              <tr
                style={{
                  color: '#475569',
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  position: 'sticky',
                  top: 0,
                  backgroundColor: '#FFFFFF',
                  zIndex: 2,
                }}
              >
                <th style={{ padding: '10px 8px', width: '75px', textAlign: 'center' }}>POS</th>
                <th style={{ padding: '10px 10px', width: '120px' }}>COACH NO.</th>
                <th style={{ padding: '10px 10px', width: '175px' }}>TYPE / CATEGORY</th>
                <th style={{ padding: '10px 10px', width: '185px' }}>TANK 1 (ARRIVAL)</th>
                <th style={{ padding: '10px 10px', width: '185px' }}>TANK 2 (DEPARTURE)</th>
                <th style={{ padding: '10px 10px', width: '175px' }}>ASSIGNED DEVICE</th>
                <th style={{ padding: '10px 10px', width: '105px', textAlign: 'center' }}>STATUS</th>
                <th style={{ padding: '10px 12px', width: '225px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayCoaches.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 16px', color: '#64748B' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#334155' }}>
                      No coaches matching the criteria
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '6px' }}>
                      {searchQuery
                        ? `No results for "${searchQuery}". Clear search or adjust filter to view all coaches.`
                        : 'No coaches configured for this train consist.'}
                    </div>
                  </td>
                </tr>
              ) : (
                displayCoaches.map((coach, index) => {
                  const t1 = coach.tanks.find((t) => t.tank_index === 1) || coach.tanks[0];
                  const t2 = coach.tanks.find((t) => t.tank_index === 2) || coach.tanks[1];
                  const isSelected = selectedCoachNumber?.toUpperCase() === coach.coach_number.toUpperCase();

                  const t1Pct = Math.round(t1?.current_level_percent ?? 0);
                  const t2Pct = Math.round(t2?.current_level_percent ?? 0);

                  const isBeingDragged = draggedCoachNumber?.toUpperCase() === coach.coach_number.toUpperCase();
                  const isTargetInsertion = dragOverIndex === index && !isBeingDragged;

                  return (
                    <tr
                      key={coach.coach_number}
                      data-coach-index={index}
                      data-coach-number={coach.coach_number}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      style={{
                        backgroundColor: isBeingDragged
                          ? '#EFF6FF'
                          : isTargetInsertion
                          ? '#F0FDF4'
                          : isSelected
                          ? '#EFF6FF'
                          : '#FFFFFF',
                        border: isBeingDragged
                          ? '2px dashed #2563EB'
                          : isTargetInsertion
                          ? '2px solid #16A34A'
                          : isSelected
                          ? '1px solid #93C5FD'
                          : '1px solid #E2E8F0',
                        borderRadius: '8px',
                        boxShadow: isBeingDragged
                          ? '0 10px 20px -3px rgba(37, 99, 235, 0.25)'
                          : isTargetInsertion
                          ? '0 0 0 2px rgba(22, 163, 74, 0.25)'
                          : '0 1px 3px rgba(0, 0, 0, 0.04)',
                        opacity: isBeingDragged ? 0.45 : 1,
                        transform: isBeingDragged ? 'scale(0.985)' : 'scale(1)',
                        transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
                      }}
                    >
                      {/* POS (Position & Drag Handle) */}
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            data-testid={`drag-handle-${coach.coach_number}`}
                            aria-label={`Drag to reorder coach ${coach.coach_number}`}
                            title={isAdmin ? `Drag to reorder coach ${coach.coach_number}` : 'Administrator authorization required to reorder'}
                            draggable={isAdmin}
                            onDragStart={(e) => handleDragStart(e, coach.coach_number)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={() => handleTouchStart(coach.coach_number, index)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            style={{
                              cursor: isAdmin ? (isBeingDragged ? 'grabbing' : 'grab') : 'not-allowed',
                              touchAction: 'none',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '26px',
                              height: '26px',
                              padding: 0,
                              borderRadius: '4px',
                              backgroundColor: isBeingDragged ? '#DBEAFE' : '#F1F5F9',
                              border: `1px solid ${isBeingDragged ? '#93C5FD' : '#CBD5E1'}`,
                              color: isAdmin ? (isBeingDragged ? '#1D4ED8' : '#64748B') : '#CBD5E1',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <GripVertical size={14} />
                          </button>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 800,
                              color: '#475569',
                              minWidth: '20px',
                              textAlign: 'center',
                            }}
                          >
                            {index + 1}
                          </span>
                        </div>
                      </td>

                      {/* COACH NO. */}
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '5px',
                              backgroundColor: '#2563EB',
                              color: '#FFFFFF',
                              fontWeight: 800,
                              fontSize: '12px',
                              letterSpacing: '0.4px',
                            }}
                          >
                            {coach.coach_number}
                          </span>
                          {coach.coach_name && coach.coach_name !== `Coach ${coach.coach_number}` && (
                            <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>{coach.coach_name}</span>
                          )}
                        </div>
                      </td>

                      {/* TYPE / CATEGORY */}
                      <td style={{ padding: '10px 10px', color: '#1E293B', fontWeight: 600 }}>
                        {coach.coach_category || coach.coach_type || 'AC 3-Tier'}
                      </td>

                      {/* TANK 1 (ARRIVAL) */}
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Droplets size={14} color="#2563EB" style={{ flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t1?.name || 'Tank 1'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{t1?.capacity_liters || 500} L &bull; {t1?.height_cm || 50} cm ({(t1?.geometry || t1?.tank_type || 'CYL').substring(0, 3)})</span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  backgroundColor: t1Pct > 50 ? '#DCFCE7' : t1Pct > 20 ? '#FEF3C7' : '#FEE2E2',
                                  color: t1Pct > 50 ? '#15803D' : t1Pct > 20 ? '#B45309' : '#B91C1C',
                                }}
                              >
                                {t1Pct}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* TANK 2 (DEPARTURE) */}
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Droplets size={14} color="#0D9488" style={{ flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t2?.name || 'Tank 2'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{t2?.capacity_liters || 500} L &bull; {t2?.height_cm || 50} cm ({(t2?.geometry || t2?.tank_type || 'CYL').substring(0, 3)})</span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  backgroundColor: t2Pct > 50 ? '#DCFCE7' : t2Pct > 20 ? '#FEF3C7' : '#FEE2E2',
                                  color: t2Pct > 50 ? '#15803D' : t2Pct > 20 ? '#B45309' : '#B91C1C',
                                }}
                              >
                                {t2Pct}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* ASSIGNED DEVICE (Monospace with Ellipsis and full tooltip) */}
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Cpu size={14} color="#64748B" style={{ flexShrink: 0 }} />
                          <span
                            title={coach.device_uid || 'Unassigned'}
                            style={{
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                              fontSize: '11px',
                              backgroundColor: '#F1F5F9',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: coach.device_uid ? '#1E293B' : '#94A3B8',
                              border: '1px solid #E2E8F0',
                              maxWidth: '140px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                            }}
                          >
                            {coach.device_uid || 'Unassigned'}
                          </span>
                        </div>
                      </td>

                      {/* STATUS */}
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: coach.is_online ? '#DCFCE7' : '#F1F5F9',
                            color: coach.is_online ? '#15803D' : '#64748B',
                          }}
                        >
                          <span
                            style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              backgroundColor: coach.is_online ? '#16A34A' : '#94A3B8',
                            }}
                          />
                          {coach.is_online ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </td>

                      {/* ACTIONS */}
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          borderTopRightRadius: '8px',
                          borderBottomRightRadius: '8px',
                        }}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {/* 1. View */}
                          <button
                            onClick={() => handleSelectCoach(coach.coach_number)}
                            title="View Coach Details"
                            style={{
                              height: '32px',
                              padding: '0 8px',
                              backgroundColor: isSelected ? '#2563EB' : '#FFFFFF',
                              color: isSelected ? '#FFFFFF' : '#1E293B',
                              border: '1px solid #CBD5E1',
                              borderRadius: '5px',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Eye size={13} />
                            <span>{isSelected ? 'Viewing' : 'View'}</span>
                          </button>

                          {/* 2. Rename */}
                          <button
                            onClick={() => handleOpenRename(coach)}
                            disabled={!isAdmin}
                            title={isAdmin ? 'Rename Coach Identifier' : 'Administrator authorization required to rename'}
                            style={{
                              height: '32px',
                              padding: '0 8px',
                              backgroundColor: '#FFFFFF',
                              color: isAdmin ? '#334155' : '#94A3B8',
                              border: '1px solid #CBD5E1',
                              borderRadius: '5px',
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Edit2 size={12} />
                            <span>Rename</span>
                          </button>

                          {/* 3. Edit */}
                          <button
                            onClick={() => handleOpenEdit(coach)}
                            disabled={!isAdmin}
                            title={isAdmin ? 'Edit Coach Parameters & Tank Capacities' : 'Administrator authorization required to edit'}
                            style={{
                              height: '32px',
                              padding: '0 8px',
                              backgroundColor: '#FFFFFF',
                              color: isAdmin ? '#2563EB' : '#94A3B8',
                              border: '1px solid #CBD5E1',
                              borderRadius: '5px',
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Sliders size={12} />
                            <span>Edit</span>
                          </button>

                          {/* 4. Delete */}
                          <button
                            onClick={() => handleOpenDelete(coach)}
                            disabled={!isAdmin}
                            title={isAdmin ? 'Delete Coach from Consist' : 'Administrator authorization required to delete'}
                            style={{
                              height: '32px',
                              width: '32px',
                              backgroundColor: '#FEF2F2',
                              color: isAdmin ? '#DC2626' : '#94A3B8',
                              border: '1px solid #FECACA',
                              borderRadius: '5px',
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Trash2 size={13} />
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

        {/* Modal Footer (Sticky) */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#475569',
            flexShrink: 0,
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: '#1E293B' }}>
              Total Coaches: {rawCoaches.length} ({rawCoaches.length * 2} Water Tanks)
            </span>
            <span style={{ color: '#CBD5E1' }}>|</span>
            <span style={{ color: '#64748B' }}>
              Showing {displayCoaches.length > 0 ? 1 : 0}–{displayCoaches.length} of {rawCoaches.length} coaches &bull; Train {effectiveTrainNumber}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              height: '34px',
              padding: '0 16px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#334155',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'background-color 0.15s ease',
            }}
          >
            <span>Close Panel</span>
          </button>
        </div>
      </div>

      {/* SUB-MODAL: Add Coach / Edit Coach */}
      {(activeSubModal === 'ADD' || activeSubModal === 'EDIT') && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
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
                padding: '14px 18px',
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    backgroundColor: '#EFF6FF',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={16} />
                </div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                  {activeSubModal === 'ADD' ? 'Add New Coach to Consist' : `Edit Coach ${targetCoach?.coach_number}`}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveSubModal('NONE')}
                  aria-label="Back to Coaches"
                  title="Back to Coach Fleet & Consist"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '5px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#475569',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <ArrowLeft size={13} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubModal('NONE')}
                  aria-label="Close"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '5px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    color: '#64748B',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E293B' }}>
                    Tank 1: Arrival Side (Primary)
                  </div>
                  <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                    Height: {formData.tank1HeightCm || 50} cm &bull; {formData.tank1Geometry}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.tank1Name}
                      onChange={(e) => setFormData({ ...formData, tank1Name: e.target.value })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Height (cm) *
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={formData.tank1HeightCm}
                      onChange={(e) => {
                        const h = parseFloat(e.target.value) || 50;
                        setFormData({
                          ...formData,
                          tank1HeightCm: h,
                        });
                      }}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Geometry
                    </label>
                    <select
                      value={formData.tank1Geometry}
                      onChange={(e) => setFormData({ ...formData, tank1Geometry: e.target.value as any })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                    >
                      <option value="CYLINDRICAL">Cylindrical</option>
                      <option value="RECTANGULAR">Rectangular</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Capacity (L)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={formData.tank1Capacity}
                      onChange={(e) => setFormData({ ...formData, tank1Capacity: parseFloat(e.target.value) || 20 })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', boxSizing: 'border-box' }}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E293B' }}>
                    Tank 2: Departure Side (Secondary)
                  </div>
                  <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                    Height: {formData.tank2HeightCm || 50} cm &bull; {formData.tank2Geometry}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.tank2Name}
                      onChange={(e) => setFormData({ ...formData, tank2Name: e.target.value })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={formData.tank2HeightCm}
                      onChange={(e) => {
                        const h = parseFloat(e.target.value) || 50;
                        setFormData({
                          ...formData,
                          tank2HeightCm: h,
                        });
                      }}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Geometry
                    </label>
                    <select
                      value={formData.tank2Geometry}
                      onChange={(e) => setFormData({ ...formData, tank2Geometry: e.target.value as any })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                    >
                      <option value="CYLINDRICAL">Cylindrical</option>
                      <option value="RECTANGULAR">Rectangular</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                      Capacity (L)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={formData.tank2Capacity}
                      onChange={(e) => setFormData({ ...formData, tank2Capacity: parseFloat(e.target.value) || 20 })}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* HARDWARE DEVICE MANAGEMENT — Rendered for both ADD and EDIT */}
              {(activeSubModal === 'ADD' || activeSubModal === 'EDIT') && (
                <div
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Cpu size={14} color="#2563EB" />
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E293B', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        Hardware Device Management
                      </span>
                    </div>

                    {/* Status Pill for Selected Device */}
                    {formData.deviceUid.trim() ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            backgroundColor: selectedDeviceObj?.isOnline ? '#DCFCE7' : '#F1F5F9',
                            color: selectedDeviceObj?.isOnline ? '#16A34A' : '#64748B',
                            border: `1px solid ${selectedDeviceObj?.isOnline ? '#86EFAC' : '#CBD5E1'}`,
                          }}
                        >
                          {selectedDeviceObj?.isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, deviceUid: '' })}
                          title="Unassign this device"
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: '#DC2626',
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FECACA',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            cursor: 'pointer',
                          }}
                        >
                          Unassign
                        </button>
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '10px',
                          backgroundColor: '#F1F5F9',
                          color: '#64748B',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        NO DEVICE ASSIGNED
                      </span>
                    )}
                  </div>

                  {/* Dropdown Selector */}
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>
                      Select Registered Hardware Node
                    </label>
                    <select
                      value={formData.deviceUid}
                      onChange={(e) => setFormData({ ...formData, deviceUid: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '5px',
                        border: '1px solid #CBD5E1',
                        fontSize: '11.5px',
                        fontFamily: 'monospace',
                        color: '#1E293B',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <option value="">[ No Device Assigned / Unassigned ]</option>
                      {allKnownDevices.map((d) => {
                        const isThisCoach =
                          activeSubModal === 'EDIT' &&
                          targetCoach &&
                          d.trainNumber === effectiveTrainNumber &&
                          d.coachNumber === targetCoach.coach_number.toUpperCase();
                        const isOtherCoach =
                          d.trainNumber &&
                          d.coachNumber &&
                          !isThisCoach &&
                          d.trainNumber !== 'UNASSIGNED';
                        const statusTag = d.isOnline ? 'ONLINE' : 'OFFLINE';
                        const assignTag = isThisCoach
                          ? 'Assigned to THIS coach'
                          : isOtherCoach
                          ? `Assigned: Train ${d.trainNumber} / Coach ${d.coachNumber}`
                          : 'AVAILABLE';
                        return (
                          <option key={d.uid} value={d.uid}>
                            {d.uid} — [{statusTag}] — {assignTag}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Manual UID Entry & Topic Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                        Device Hardware UID (Hexadecimal)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0026004D4B42501120353332 (or blank to unassign)"
                        value={formData.deviceUid}
                        onChange={(e) => setFormData({ ...formData, deviceUid: e.target.value.toUpperCase() })}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Duplicate Assignment Warning / Status Notice */}
                    {isAssignedToOtherCoach && selectedDeviceObj && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '10.5px',
                          color: '#B45309',
                          backgroundColor: '#FFFBEB',
                          border: '1px solid #FCD34D',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          marginTop: '2px',
                        }}
                      >
                        <AlertTriangle size={13} color="#D97706" style={{ flexShrink: 0 }} />
                        <span>
                          Notice: Device is currently mapped to Train {selectedDeviceObj.trainNumber} / Coach {selectedDeviceObj.coachNumber}. Saving will reassign it to this coach.
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                      MQTT Telemetry Topic: <code>{formData.deviceUid ? formData.deviceUid : '0023004D4B42501120353332'}</code>
                    </div>
                  </div>
                </div>
              )}

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
            zIndex: 100000,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
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
                padding: '14px 18px',
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    backgroundColor: '#EFF6FF',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Edit2 size={15} />
                </div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                  Rename Coach {targetCoach.coach_number}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveSubModal('NONE')}
                  aria-label="Back to Coaches"
                  title="Back to Coach Fleet & Consist"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '5px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#475569',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <ArrowLeft size={13} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubModal('NONE')}
                  aria-label="Close"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '5px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    color: '#64748B',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
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
            zIndex: 100000,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
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
                padding: '14px 18px',
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #FEE2E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertTriangle size={16} />
                </div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#DC2626' }}>
                  Confirm Coach Deletion
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveSubModal('NONE')}
                  aria-label="Back to Coaches"
                  title="Back to Coach Fleet & Consist"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '5px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <ArrowLeft size={13} />
                  <span>Back</span>
                </button>
                <button
                  onClick={() => setActiveSubModal('NONE')}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '5px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#DC2626',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
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

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

