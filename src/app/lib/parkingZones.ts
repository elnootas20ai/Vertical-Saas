import { v4 as uuidv4 } from 'uuid';

export interface ParkingSpot {
  id: string;
  number: string;
  vehicleId?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
}

export interface ParkingZone {
  id: string;
  name: string;
  description: string;
  color: string;
  capacity: number;
  spots: ParkingSpot[];
}

export interface CreateParkingZoneInput {
  name: string;
  description?: string;
  color: string;
  capacity: number;
}

interface VehicleLike {
  id: string;
  registrationPlate: string;
  brand: string;
  model: string;
  location?: string;
}

export const ZONE_COLOR_OPTIONS = [
  { value: 'blue', label: 'Azul', bg: 'bg-blue-600', preview: 'bg-blue-50', border: 'border-blue-500', spotOccupied: 'bg-blue-500', spotFree: 'bg-blue-100' },
  { value: 'green', label: 'Verde', bg: 'bg-green-600', preview: 'bg-green-50', border: 'border-green-500', spotOccupied: 'bg-green-500', spotFree: 'bg-green-100' },
  { value: 'amber', label: 'Ambar', bg: 'bg-amber-500', preview: 'bg-amber-50', border: 'border-amber-500', spotOccupied: 'bg-amber-400', spotFree: 'bg-amber-100' },
  { value: 'purple', label: 'Morado', bg: 'bg-purple-600', preview: 'bg-purple-50', border: 'border-purple-500', spotOccupied: 'bg-purple-500', spotFree: 'bg-purple-100' },
  { value: 'red', label: 'Rojo', bg: 'bg-red-600', preview: 'bg-red-50', border: 'border-red-500', spotOccupied: 'bg-red-500', spotFree: 'bg-red-100' },
  { value: 'cyan', label: 'Cian', bg: 'bg-cyan-600', preview: 'bg-cyan-50', border: 'border-cyan-500', spotOccupied: 'bg-cyan-500', spotFree: 'bg-cyan-100' },
] as const;

export const ZONE_COLOR_MAP: Record<string, { bg: string; border: string; text: string; accent: string; light: string; hover: string }> = {
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-900',
    accent: 'bg-blue-600',
    light: 'text-blue-700',
    hover: 'hover:border-blue-300',
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-900',
    accent: 'bg-green-600',
    light: 'text-green-700',
    hover: 'hover:border-green-300',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-900',
    accent: 'bg-amber-600',
    light: 'text-amber-700',
    hover: 'hover:border-amber-300',
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-900',
    accent: 'bg-purple-600',
    light: 'text-purple-700',
    hover: 'hover:border-purple-300',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-900',
    accent: 'bg-red-600',
    light: 'text-red-700',
    hover: 'hover:border-red-300',
  },
  cyan: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    text: 'text-cyan-900',
    accent: 'bg-cyan-600',
    light: 'text-cyan-700',
    hover: 'hover:border-cyan-300',
  },
};

function slugify(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getZonePrefix(name: string) {
  const words = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'Z';
  }

  if (words[0].toLowerCase() === 'zona' && words[1]) {
    return words[1].slice(0, 3).toUpperCase();
  }

  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }

  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function buildSpots(name: string, capacity: number): ParkingSpot[] {
  const prefix = getZonePrefix(name);
  return Array.from({ length: capacity }, (_, index) => ({
    id: `spot-${uuidv4()}`,
    number: `${prefix}-${String(index + 1).padStart(2, '0')}`,
  }));
}

export function createParkingZone(input: CreateParkingZoneInput): ParkingZone {
  const normalizedName = input.name.trim();
  const normalizedDescription = String(input.description || '').trim();
  const normalizedCapacity = Math.max(1, Math.min(200, Number(input.capacity) || 1));

  return {
    id: slugify(normalizedName) || `zona-${uuidv4()}`,
    name: normalizedName,
    description: normalizedDescription,
    color: input.color,
    capacity: normalizedCapacity,
    spots: buildSpots(normalizedName, normalizedCapacity),
  };
}


function normalizeLocation(value?: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function hydrateParkingZonesWithVehicles(zones: ParkingZone[], vehicles: VehicleLike[] = []): ParkingZone[] {
  const nextZones = zones.map((zone) => ({
    ...zone,
    spots: zone.spots.map((spot) => ({
      id: spot.id,
      number: spot.number,
    })),
  }));

  const exactAssigned = new Set<string>();

  vehicles
    .filter((vehicle) => vehicle.location)
    .forEach((vehicle) => {
      const location = normalizeLocation(vehicle.location);
      for (const zone of nextZones) {
        const spot = zone.spots.find(
          (item) =>
            normalizeLocation(item.number) === location ||
            normalizeLocation(`${zone.name} ${item.number}`) === location ||
            location.includes(normalizeLocation(item.number)),
        );

        if (!spot || spot.vehicleId) {
          continue;
        }

        Object.assign(spot, {
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.registrationPlate,
          vehicleModel: `${vehicle.brand} ${vehicle.model}`,
        });
        exactAssigned.add(vehicle.id);
        break;
      }
    });

  vehicles
    .filter((vehicle) => vehicle.location && !exactAssigned.has(vehicle.id))
    .forEach((vehicle) => {
      const location = normalizeLocation(vehicle.location);
      const matchingZone = nextZones.find(
        (zone) =>
          normalizeLocation(zone.name) === location ||
          normalizeLocation(zone.id) === location ||
          location.includes(normalizeLocation(zone.name)),
      );
      const freeSpot = matchingZone?.spots.find((spot) => !spot.vehicleId);
      if (!freeSpot) {
        return;
      }
      Object.assign(freeSpot, {
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.registrationPlate,
        vehicleModel: `${vehicle.brand} ${vehicle.model}`,
      });
      exactAssigned.add(vehicle.id);
    });

  const remainingVehicles = vehicles.filter((vehicle) => !exactAssigned.has(vehicle.id));
  const freeSpots = nextZones.flatMap((zone) => zone.spots.filter((spot) => !spot.vehicleId));

  remainingVehicles.forEach((vehicle, index) => {
    const spot = freeSpots[index];
    if (!spot) {
      return;
    }
    Object.assign(spot, {
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.registrationPlate,
      vehicleModel: `${vehicle.brand} ${vehicle.model}`,
    });
  });

  return nextZones;
}
