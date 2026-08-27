import { useEffect, useRef, useState, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import { checkClientDuplicatesByFieldRequest } from '../lib/crmApi';
import type { Client } from '../context/AppContext';

type MatchField = 'phone' | 'email' | 'dni';

interface DuplicateSearchResult {
  duplicates: Client[];
  isSearching: boolean;
  matchedField: MatchField | null;
  dismissed: boolean;
  clearDuplicates: () => void;
  dismissDuplicates: () => void;
}

interface DuplicateSearchParams {
  userId: string;
  phone?: string;
  email?: string;
  dni?: string;
  enabled?: boolean;
  debounceMs?: number;
}

const MIN_PHONE_DIGITS = 6;
const MIN_DNI_LENGTH = 8;

function extractDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function useClientDuplicateSearch({
  userId,
  phone = '',
  email = '',
  dni = '',
  enabled = true,
  debounceMs = 500,
}: DuplicateSearchParams): DuplicateSearchResult {
  const [duplicates, setDuplicates] = useState<Client[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [matchedField, setMatchedField] = useState<MatchField | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /** Sin debounce al cerrar el modal: evita buscar el teléfono/email del alta anterior. */
  const debounceDelay = enabled ? debounceMs : 0;
  const debouncedPhone = useDebounce(phone, debounceDelay);
  const debouncedEmail = useDebounce(email, debounceDelay);
  const debouncedDni = useDebounce(dni, debounceDelay);

  const clearDuplicates = useCallback(() => {
    setDuplicates([]);
    setMatchedField(null);
    setDismissed(false);
  }, []);

  const dismissDuplicates = useCallback(() => {
    setDismissed(true);
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      setDuplicates([]);
      setMatchedField(null);
      setIsSearching(false);
      return;
    }

    const phoneDigits = extractDigits(debouncedPhone);
    const searches: { field: MatchField; value: string }[] = [];

    if (phoneDigits.length >= MIN_PHONE_DIGITS) {
      searches.push({ field: 'phone', value: debouncedPhone });
    }
    if (isEmailLike(debouncedEmail)) {
      searches.push({ field: 'email', value: debouncedEmail });
    }
    if (debouncedDni.trim().length >= MIN_DNI_LENGTH) {
      searches.push({ field: 'dni', value: debouncedDni });
    }

    if (searches.length === 0) {
      setDuplicates([]);
      setMatchedField(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setIsSearching(true);

    (async () => {
      try {
        for (const { field, value } of searches) {
          if (cancelled) return;
          const result = await checkClientDuplicatesByFieldRequest(
            userId,
            field,
            value,
            controller.signal,
          );
          if (!cancelled && result.duplicates.length > 0) {
            setDuplicates(result.duplicates);
            setMatchedField(field);
            setIsSearching(false);
            return;
          }
        }
        if (!cancelled) {
          setDuplicates([]);
          setMatchedField(null);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cancelled) {
          setDuplicates([]);
          setMatchedField(null);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [userId, debouncedPhone, debouncedEmail, debouncedDni, enabled]);

  return { duplicates, isSearching, matchedField, dismissed, clearDuplicates, dismissDuplicates };
}
