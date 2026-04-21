import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { CatalogItem } from '../lib/deliveryApi';

export interface TpvTicketLine {
  id: string;
  catalogItem: CatalogItem;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface TpvWorker {
  id: string;
  name: string;
  avatar?: string;
}

export interface TpvTicketClient {
  id: string;
  name: string;
  phone: string;
  addressId?: string;
  addressLabel?: string;
}

interface TpvContextType {
  lines: TpvTicketLine[];
  activeWorker: TpvWorker | null;
  ticketClient: TpvTicketClient | null;
  ticketTotal: number;
  ticketCount: number;

  addItem: (item: CatalogItem) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, qty: number) => void;
  clearTicket: () => void;

  setActiveWorker: (worker: TpvWorker | null) => void;
  setTicketClient: (client: TpvTicketClient | null) => void;
}

const TpvContext = createContext<TpvContextType | undefined>(undefined);

export function TpvProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<TpvTicketLine[]>([]);
  const [activeWorker, setActiveWorker] = useState<TpvWorker | null>(null);
  const [ticketClient, setTicketClient] = useState<TpvTicketClient | null>(null);

  const addItem = useCallback((item: CatalogItem) => {
    setLines(prev => {
      const existing = prev.find(l => l.catalogItem._id === item._id);
      if (existing) {
        return prev.map(l =>
          l.id === existing.id
            ? { ...l, quantity: l.quantity + 1, total: (l.quantity + 1) * l.unitPrice }
            : l,
        );
      }
      return [
        ...prev,
        {
          id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          catalogItem: item,
          quantity: 1,
          unitPrice: item.unitPrice,
          total: item.unitPrice,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setLines(prev => prev.filter(l => l.id !== lineId));
  }, []);

  const updateQuantity = useCallback((lineId: string, qty: number) => {
    if (qty <= 0) {
      setLines(prev => prev.filter(l => l.id !== lineId));
      return;
    }
    setLines(prev =>
      prev.map(l => (l.id === lineId ? { ...l, quantity: qty, total: qty * l.unitPrice } : l)),
    );
  }, []);

  const clearTicket = useCallback(() => {
    setLines([]);
    setTicketClient(null);
  }, []);

  const ticketTotal = lines.reduce((sum, l) => sum + l.total, 0);
  const ticketCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <TpvContext.Provider
      value={{
        lines,
        activeWorker,
        ticketClient,
        ticketTotal,
        ticketCount,
        addItem,
        removeItem,
        updateQuantity,
        clearTicket,
        setActiveWorker,
        setTicketClient,
      }}
    >
      {children}
    </TpvContext.Provider>
  );
}

export function useTpv() {
  const ctx = useContext(TpvContext);
  if (!ctx) throw new Error('useTpv must be used within TpvProvider');
  return ctx;
}
