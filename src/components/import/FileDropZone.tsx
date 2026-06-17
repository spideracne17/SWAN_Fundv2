import { useCallback, useRef, useState } from 'react';
import './FileDropZone.css';

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

type DropZoneState = 'idle' | 'drag-over' | 'error' | 'success';

interface FileDropZoneProps {
  onFileAccepted: (file: File) => void;
  onError: (message: string) => void;
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

function validateFile(file: File): string | null {
  const extension = getFileExtension(file.name);

  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    return `Invalid file type "${extension || 'unknown'}". Only CSV and XLSX files are accepted.`;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${sizeMB} MB). Maximum size is 10 MB.`;
  }

  return null;
}

function FileDropZone({ onFileAccepted, onError }: FileDropZoneProps) {
  const [state, setState] = useState<DropZoneState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [acceptedFileName, setAcceptedFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleFile = useCallback(
    (file: File) => {
      const error = validateFile(file);
      if (error) {
        setState('error');
        setErrorMessage(error);
        onError(error);
        return;
      }

      setState('success');
      setAcceptedFileName(file.name);
      setErrorMessage('');
      onFileAccepted(file);
    },
    [onFileAccepted, onError],
  );

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setState('drag-over');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setState('idle');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;

      const files = e.dataTransfer.files;
      if (files.length === 0) {
        setState('idle');
        return;
      }

      const file = files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (file) handleFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [handleFile],
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      className={`file-drop-zone file-drop-zone--${state}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label="File upload drop zone. Drop a CSV or XLSX file here, or click to browse."
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleBrowseClick();
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx"
        onChange={handleInputChange}
        className="file-drop-zone__input"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="file-drop-zone__content">
        {state === 'idle' && (
          <>
            <span className="file-drop-zone__icon">📂</span>
            <p className="file-drop-zone__text">
              Drag &amp; drop your CSV or XLSX file here
            </p>
            <p className="file-drop-zone__subtext">
              or{' '}
              <button
                type="button"
                className="file-drop-zone__browse-btn"
                onClick={handleBrowseClick}
              >
                browse files
              </button>
            </p>
            <p className="file-drop-zone__hint">Supported: .csv, .xlsx (max 10 MB)</p>
          </>
        )}

        {state === 'drag-over' && (
          <>
            <span className="file-drop-zone__icon">⬇️</span>
            <p className="file-drop-zone__text">Drop your file here</p>
          </>
        )}

        {state === 'error' && (
          <>
            <span className="file-drop-zone__icon">❌</span>
            <p className="file-drop-zone__text file-drop-zone__text--error">
              {errorMessage}
            </p>
            <p className="file-drop-zone__subtext">
              <button
                type="button"
                className="file-drop-zone__browse-btn"
                onClick={handleBrowseClick}
              >
                Try another file
              </button>
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <span className="file-drop-zone__icon">✅</span>
            <p className="file-drop-zone__text file-drop-zone__text--success">
              {acceptedFileName}
            </p>
            <p className="file-drop-zone__subtext">File accepted</p>
          </>
        )}
      </div>
    </div>
  );
}

export { validateFile, getFileExtension };
export type { FileDropZoneProps, DropZoneState };
export default FileDropZone;
