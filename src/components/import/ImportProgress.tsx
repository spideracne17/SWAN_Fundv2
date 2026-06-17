import './ImportProgress.css';

export type ImportStage = 'parsing' | 'validating' | 'importing' | 'backup' | 'complete' | 'error';

interface ImportProgressProps {
  /** Current import stage or terminal state ('complete' | 'error') */
  currentStage: ImportStage;
  /** Error message to display when currentStage is 'error' */
  errorMessage?: string;
  /** Which stage the error occurred at (defaults to 'parsing' if not provided) */
  errorAtStage?: 'parsing' | 'validating' | 'importing' | 'backup';
}

interface StageConfig {
  key: 'parsing' | 'validating' | 'importing' | 'backup';
  label: string;
}

const STAGES: StageConfig[] = [
  { key: 'parsing', label: 'Parsing file' },
  { key: 'validating', label: 'Validating records' },
  { key: 'importing', label: 'Importing data' },
  { key: 'backup', label: 'Generating backup' },
];

function getStageIndex(key: string): number {
  return STAGES.findIndex((s) => s.key === key);
}

type StageStatus = 'pending' | 'active' | 'complete';

function resolveStageStatus(
  stageKey: string,
  currentStage: ImportStage,
  errorAtStage?: string,
): StageStatus {
  const stageIndex = getStageIndex(stageKey);

  if (currentStage === 'complete') {
    return 'complete';
  }

  if (currentStage === 'error') {
    const errorIndex = getStageIndex(errorAtStage ?? 'parsing');
    if (stageIndex < errorIndex) return 'complete';
    if (stageIndex === errorIndex) return 'active';
    return 'pending';
  }

  const currentIndex = getStageIndex(currentStage);
  if (stageIndex < currentIndex) return 'complete';
  if (stageIndex === currentIndex) return 'active';
  return 'pending';
}

function ImportProgress({ currentStage, errorMessage, errorAtStage }: ImportProgressProps) {
  const isError = currentStage === 'error';

  return (
    <div
      className={`import-progress${isError ? ' import-progress--error' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Import progress"
    >
      <h3 className="import-progress__title">
        {currentStage === 'complete' ? 'Import Complete' : isError ? 'Import Failed' : 'Importing…'}
      </h3>

      <div className="import-progress__stages">
        {STAGES.map((stage) => {
          const status = resolveStageStatus(stage.key, currentStage, errorAtStage);
          const isErroredStage = isError && stage.key === (errorAtStage ?? 'parsing');

          return (
            <div
              key={stage.key}
              className={`import-progress__stage import-progress__stage--${isErroredStage ? 'active' : status}`}
              aria-label={`${stage.label}: ${isErroredStage ? 'error' : status}`}
            >
              <span className="import-progress__stage-icon">
                {isErroredStage && <span className="import-progress__error-icon">✕</span>}
                {!isErroredStage && status === 'active' && (
                  <span className="import-progress__spinner" aria-hidden="true" />
                )}
                {!isErroredStage && status === 'complete' && (
                  <span className="import-progress__checkmark" aria-hidden="true">✓</span>
                )}
                {!isErroredStage && status === 'pending' && (
                  <span className="import-progress__pending-dot" aria-hidden="true" />
                )}
              </span>
              <span className="import-progress__stage-label">{stage.label}</span>
            </div>
          );
        })}
      </div>

      {isError && errorMessage && (
        <p className="import-progress__error-message" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export type { ImportProgressProps };
export default ImportProgress;
