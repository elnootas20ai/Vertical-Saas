import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useActivationFocus } from '../../hooks/useActivationFocus';
import { useBusiness } from '../../context/BusinessContext';
import { getActivationFieldGuide } from '../../lib/activationGuide';
import { ActivationFocusBanner, scrollToActivationField } from './ActivationGuideUi';

const HIGHLIGHT_CLASS = 'activation-field-highlight';

export function ActivationPageCoach() {
  const location = useLocation();
  const { focus, clearFocus } = useActivationFocus();
  const { currentBusiness } = useBusiness();

  const guide = useMemo(
    () => (focus ? getActivationFieldGuide(focus, currentBusiness?.businessType) : null),
    [focus, currentBusiness?.businessType],
  );

  useEffect(() => {
    if (!guide) return;

    const mark = () => scrollToActivationField(guide.fieldKey);
    if (mark()) return;

    const t1 = window.setTimeout(mark, 350);
    const t2 = window.setTimeout(mark, 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((node) => {
        node.classList.remove(HIGHLIGHT_CLASS);
      });
    };
  }, [guide, location.pathname]);

  useEffect(() => {
    return () => {
      document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
        el.classList.remove(HIGHLIGHT_CLASS);
      });
    };
  }, []);

  if (!guide || !focus) return null;

  return <ActivationFocusBanner fieldKey={focus} onDismiss={clearFocus} />;
}
