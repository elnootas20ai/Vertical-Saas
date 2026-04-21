import type { Vehicle } from '../context/AppContext';

export type MockDocumentStatus = 'pending' | 'signed' | 'sent' | 'completed';
export type MockDocumentCategory = 'society' | 'contracts' | 'licenses' | 'financial' | 'user-expenses' | 'other';

export interface MockDocument {
  id: string;
  name: string;
  category: MockDocumentCategory;
  status: MockDocumentStatus;
  vehicleId?: string;
  vehicleName?: string;
  clientId?: string;
  clientName?: string;
  responsible: string;
  createdAt: string;
  updatedAt: string;
  fileUrl?: string;
  notes?: string;
}

export interface MockZoneSpot {
  id: string;
  number: string;
  vehicleId?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
}

export interface MockZone {
  id: string;
  name: string;
  description: string;
  color: string;
  capacity: number;
  spots: MockZoneSpot[];
}

export function getMockDocuments(vehicles: Vehicle[] = []): MockDocument[] {
  return [];
}

export function getMockZones(vehicles: Vehicle[] = []): MockZone[] {
  return [];
}
