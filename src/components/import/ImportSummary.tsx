import { useState } from 'react';
import type { ImportSummary as ImportSummaryData } from '@/lib/import/importRecords';
import './ImportSummary.css';

interface ImportSummaryProps {
  summary: ImportSummaryData;
}

/**
 * Displays a summary of a completed CSV import with counts and error details.
 *
 * Shows color-coded badges for new records (green), duplicates (gray),
 * and errors (red). If errors are present, an expandable table shows
 * per-row error details (row number, field, value, error message).
 */
function ImportSummary({ summary }: ImportSummaryProps) {
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const hasErrors = summary.records_error > 0;

  return (
    <div className="import-summary" role="region" aria-label="Import summary">
      <h3 className="import-summary__title">Import Complete</h3>

      <div className="import-summary__counts">
        <div className="import-summary__count-item">
          <span className="import-summary__count-label">Total</span>
          <span className="import-summary__badge import-summary__badge--total">
            {summary.records_total}
          </span>
        </div>

        <div className="import-summary__count-item">
          <span className="import-summary__count-label">New</span>
          <span className="import-summary__badge import-summary__badge--new">
            {summary.records_new}
          </span>
        </div>

        <div className="import-summary__count-item">
          <span className="import-summary__count-label">Duplicates</span>
          <span className="import-summary__badge import-summary__badge--duplicate">
            {summary.records_duplicate}
          </span>
        </div>

        <div className="import-summary__count-item">
          <span className="import-summary__count-label">Errors</span>
          <span className="import-summary__badge import-summary__badge--error">
            {summary.records_error}
          </span>
        </div>
      </div>

      {hasErrors && (
        <div className="import-summary__errors">
          <button
            type="button"
            className="import-summary__errors-toggle"
            onClick={() => setErrorsExpanded(!errorsExpanded)}
            aria-expanded={errorsExpanded}
            aria-controls="import-error-details"
          >
            <span className="import-summary__errors-toggle-icon">
              {errorsExpanded ? '▾' : '▸'}
            </span>
            Error Details ({summary.errors.length})
          </button>

          {errorsExpanded && (
            <div
              id="import-error-details"
              className="import-summary__errors-table-wrapper"
            >
              <table className="import-summary__errors-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Field</th>
                    <th>Value</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.errors.map((err, index) => (
                    <tr key={index}>
                      <td>{err.row_number}</td>
                      <td>{err.field}</td>
                      <td className="import-summary__error-value">
                        {err.value}
                      </td>
                      <td className="import-summary__error-message">
                        {err.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { ImportSummaryProps };
export default ImportSummary;
