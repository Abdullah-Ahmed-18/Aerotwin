'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Checkpoint } from '@/components/ConfigurationSidebar';

interface AppStateContextValue {
  checkpoints: Checkpoint[];
  setCheckpoints: React.Dispatch<React.SetStateAction<Checkpoint[]>>;
  fetchedFlights: any[];
  setFetchedFlights: React.Dispatch<React.SetStateAction<any[]>>;
  selectedStatusFilters: string[];
  setSelectedStatusFilters: React.Dispatch<React.SetStateAction<string[]>>;
  selectedFlightIds: Set<string>;
  setSelectedFlightIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedAirportCode: string;
  setSelectedAirportCode: React.Dispatch<React.SetStateAction<string>>;
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  manageId: string | null;
  setManageId: React.Dispatch<React.SetStateAction<string | null>>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

const STORAGE_KEYS = {
  checkpoints: 'aerotwin:config',
  fetchedFlights: 'aerotwin:flights',
  selectedStatusFilters: 'aerotwin:filters',
  selectedFlightIds: 'aerotwin:selectedFlightIds',
  selectedAirportCode: 'aerotwin:airportCode',
  selectedId: 'aerotwin:selectedId',
  manageId: 'aerotwin:manageId',
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [fetchedFlights, setFetchedFlights] = useState<any[]>([]);
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>(['all']);
  const [selectedFlightIds, setSelectedFlightIds] = useState<Set<string>>(new Set());
  const [selectedAirportCode, setSelectedAirportCode] = useState('HBE');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (guarded for SSR)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cpRaw = localStorage.getItem(STORAGE_KEYS.checkpoints);
      if (cpRaw) {
        const parsed = JSON.parse(cpRaw) as Checkpoint[];
        setCheckpoints(parsed);
      }

      const ffRaw = localStorage.getItem(STORAGE_KEYS.fetchedFlights);
      if (ffRaw) setFetchedFlights(JSON.parse(ffRaw));

      const sfRaw = localStorage.getItem(STORAGE_KEYS.selectedStatusFilters);
      if (sfRaw) setSelectedStatusFilters(JSON.parse(sfRaw));

      const sfiRaw = localStorage.getItem(STORAGE_KEYS.selectedFlightIds);
      if (sfiRaw) setSelectedFlightIds(new Set(JSON.parse(sfiRaw)));

      const sacRaw = localStorage.getItem(STORAGE_KEYS.selectedAirportCode);
      if (sacRaw) setSelectedAirportCode(sacRaw);

      const sidRaw = localStorage.getItem(STORAGE_KEYS.selectedId);
      if (sidRaw) setSelectedId(sidRaw === 'null' ? null : sidRaw);

      const midRaw = localStorage.getItem(STORAGE_KEYS.manageId);
      if (midRaw) setManageId(midRaw === 'null' ? null : midRaw);
    } catch (e) {
      console.error('Failed to hydrate app state:', e);
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.checkpoints, JSON.stringify(checkpoints));
    } catch {}
  }, [checkpoints, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.fetchedFlights, JSON.stringify(fetchedFlights));
    } catch {}
  }, [fetchedFlights, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.selectedStatusFilters, JSON.stringify(selectedStatusFilters));
    } catch {}
  }, [selectedStatusFilters, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.selectedFlightIds, JSON.stringify(Array.from(selectedFlightIds)));
    } catch {}
  }, [selectedFlightIds, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.selectedAirportCode, selectedAirportCode);
    } catch {}
  }, [selectedAirportCode, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.selectedId, selectedId ?? 'null');
    } catch {}
  }, [selectedId, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.manageId, manageId ?? 'null');
    } catch {}
  }, [manageId, hydrated]);

  return (
    <AppStateContext.Provider
      value={{
        checkpoints,
        setCheckpoints,
        fetchedFlights,
        setFetchedFlights,
        selectedStatusFilters,
        setSelectedStatusFilters,
        selectedFlightIds,
        setSelectedFlightIds,
        selectedAirportCode,
        setSelectedAirportCode,
        selectedId,
        setSelectedId,
        manageId,
        setManageId,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
