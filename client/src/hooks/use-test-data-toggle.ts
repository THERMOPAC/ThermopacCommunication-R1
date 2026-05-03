import { useState, useEffect } from "react";

const STORAGE_KEY = "thermopac_show_test_data";

export function useTestDataToggle() {
  const [showTestData, setShowTestData] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, showTestData ? "true" : "false");
    } catch {
      // ignore
    }
  }, [showTestData]);

  const toggle = () => setShowTestData(prev => !prev);

  return { showTestData, toggle, setShowTestData };
}
