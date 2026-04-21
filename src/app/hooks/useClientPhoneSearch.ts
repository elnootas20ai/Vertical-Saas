import { useState, useEffect, useRef, useCallback } from 'react';
import { searchClientsByPhoneRequest } from '../lib/crmApi';
import type { Client } from '../context/AppContext';

export interface ClientPhoneSearchResult {
  results: Client[];
  isSearching: boolean;
  selectedClient: Client | null;
  selectClient: (client: Client) => void;
  clearSelection: () => void;
  clearResults: () => void;
}

export function useClientPhoneSearch(params: {
  userId: string;
  phone: string;
  enabled?: boolean;
  debounceMs?: number;
  minDigits?: number;
}): ClientPhoneSearchResult {
  const { userId, phone, enabled = true, debounceMs = 300, minDigits = 3 } = params;
  const [results, setResults] = useState<Client[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const digits = phone.replace(/\D/g, '');

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled || !userId || digits.length < minDigits || selectedClient) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const clients = await searchClientsByPhoneRequest(userId, digits, 5, controller.signal);
        if (!controller.signal.aborted) {
          setResults(clients);
          setIsSearching(false);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setResults([]);
          setIsSearching(false);
        }
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [digits, userId, enabled, debounceMs, minDigits, selectedClient]);

  const selectClient = useCallback((client: Client) => {
    setSelectedClient(client);
    setResults([]);
    setIsSearching(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClient(null);
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setIsSearching(false);
  }, []);

  return { results, isSearching, selectedClient, selectClient, clearSelection, clearResults };
}
