import { useRef, useEffect, useCallback, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { ACCESO__Input } from './ACCESO__Input';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

interface PlaceResult {
  address: string;
  province?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: PlaceResult) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&language=es`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

function extractComponent(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  type: string,
): string {
  return components?.find((c) => c.types.includes(type))?.long_name ?? '';
}

export function ACCESO__AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  label = 'Dirección',
  placeholder = 'Empieza a escribir una dirección…',
  required,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.formatted_address) return;

    const result: PlaceResult = {
      address: place.formatted_address,
      province:
        extractComponent(place.address_components, 'administrative_area_level_2') ||
        extractComponent(place.address_components, 'administrative_area_level_1'),
      postalCode: extractComponent(place.address_components, 'postal_code'),
      city: extractComponent(place.address_components, 'locality'),
      country: extractComponent(place.address_components, 'country'),
      lat: place.geometry?.location?.lat(),
      lng: place.geometry?.location?.lng(),
    };

    onChange(result.address);
    onPlaceSelect?.(result);
  }, [onChange, onPlaceSelect]);

  useEffect(() => {
    if (!API_KEY || !inputRef.current) return;

    let cancelled = false;
    setLoading(true);

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !inputRef.current) return;

        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'es' },
          fields: ['formatted_address', 'address_components', 'geometry'],
        });

        ac.addListener('place_changed', handlePlaceChanged);
        autocompleteRef.current = ac;
        setReady(true);
      })
      .catch(() => {/* falls back to plain input */})
      .finally(() => setLoading(false));

    return () => {
      cancelled = true;
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [handlePlaceChanged]);

  if (!API_KEY) {
    return (
      <ACCESO__Input
        label={label}
        type="text"
        placeholder="Dirección fiscal (opcional)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    );
  }

  return (
    <ACCESO__Input
      ref={inputRef}
      label={label}
      type="text"
      placeholder={ready ? placeholder : 'Cargando Google Places…'}
      icon={
        loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <MapPin className="w-5 h-5" />
        )
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoComplete="off"
    />
  );
}
