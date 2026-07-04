import { useCallback, useEffect, useState } from 'react';

import type { Business } from '../lib/businessApi';

import {

  loadInviteWorkCenterOptions,

  type InviteWorkCenterOption,

} from '../lib/inviteWorkCenters';

import { useAuth } from '../context/AuthContext';

import { useBusiness } from '../context/BusinessContext';



/**

 * Centros/tiendas para el modal de invitación. Se recarga al abrir, al cambiar

 * de negocio y cuando se crea/edita una tienda (evento work-centers:changed).

 */

export function useInviteWorkCenters(

  business: Business | null | undefined,

  enabled: boolean,

) {

  const { user } = useAuth();

  const { businesses } = useBusiness();

  const [options, setOptions] = useState<InviteWorkCenterOption[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const reload = useCallback(async () => {

    if (!enabled || !user) {

      setOptions([]);

      setError(null);

      setLoading(false);

      return;

    }

    setLoading(true);

    setError(null);

    try {

      const next = await loadInviteWorkCenterOptions(user, business ?? null, {

        allBusinesses: businesses,

        accountBusinessCount: businesses.length,

      });

      setOptions(next);

    } catch (err) {

      setOptions([]);

      setError(err instanceof Error ? err.message : 'No se pudieron cargar los centros de trabajo');

    } finally {

      setLoading(false);

    }

  }, [business, businesses, enabled, user]);



  useEffect(() => {

    void reload();

  }, [reload]);



  useEffect(() => {

    if (!enabled) return;

    const onChanged = () => {

      void reload();

    };

    window.addEventListener('work-centers:changed', onChanged);

    return () => window.removeEventListener('work-centers:changed', onChanged);

  }, [enabled, reload]);



  return { options, loading, error, reload };

}

