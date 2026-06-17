import { useEffect } from 'react';

const APP_NAME = 'Investment Workbook';

/**
 * Sets document.title on mount and resets on unmount.
 * @param title - Page-specific title (e.g. "Accounting Dashboard")
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
