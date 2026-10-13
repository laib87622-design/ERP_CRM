import { useContext } from 'react';
import { FinancialPasswordContext } from './financialPasswordContext';

export const useFinancialPasswordConfirmation = () => {
  const confirmAction = useContext(FinancialPasswordContext);
  if (!confirmAction) {
    throw new Error('useFinancialPasswordConfirmation must be used within FinancialPasswordProvider.');
  }
  return confirmAction;
};
