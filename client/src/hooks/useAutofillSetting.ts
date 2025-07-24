import { useState, useEffect } from 'react';

const AUTOFILL_SETTING_KEY = 'disableAutofill';

export function useAutofillSetting() {
  const [disableAutofill, setDisableAutofill] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true; // Default to disabled on server
    
    try {
      const stored = localStorage.getItem(AUTOFILL_SETTING_KEY);
      return stored ? JSON.parse(stored) : true; // Default to disabled (true)
    } catch {
      return true; // Default to disabled if parsing fails
    }
  });

  const updateAutofillSetting = (newValue: boolean) => {
    setDisableAutofill(newValue);
    
    try {
      localStorage.setItem(AUTOFILL_SETTING_KEY, JSON.stringify(newValue));
    } catch (error) {
      console.warn('Failed to save autofill setting to localStorage:', error);
    }
  };

  return { disableAutofill, updateAutofillSetting };
}