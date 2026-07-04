import { useEffect, useState, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { fetchSettings, updateSetting } from '@/lib/settings';
import { loadLocalSettings, saveLocalSetting, type DividendLocalSettings } from '@/lib/dividendEngine/localSettings';
import type { SettingsRecord, SettingsCategory } from '@/types/database';
import './SettingsPage.css';

const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  market_color: 'Market Color',
  trade_capacity: 'Trade Capacity',
  tax: 'Tax',
  display: 'Display',
  import: 'Import',
  performance: 'Performance',
  risk: 'Risk',
};

const CATEGORY_ORDER: SettingsCategory[] = [
  'market_color',
  'trade_capacity',
  'tax',
  'display',
  'import',
  'performance',
  'risk',
];

function SettingsPage() {
  usePageTitle('Settings');

  const [settings, setSettings] = useState<SettingsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('market_color');
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSettings();
      setSettings(data);

      // Initialize edit values with current values
      const values: Record<string, string> = {};
      for (const s of data) {
        values[s.id] = s.value;
      }
      setEditValues(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleValueChange = (id: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [id]: value }));
    // Clear success indicator when editing
    setSaveSuccess((prev) => ({ ...prev, [id]: false }));
  };

  const handleSave = async (setting: SettingsRecord) => {
    const newValue = editValues[setting.id] ?? setting.value;
    if (newValue === setting.value) return;

    try {
      setSaving((prev) => ({ ...prev, [setting.id]: true }));
      const updated = await updateSetting(setting.id, newValue);
      setSettings((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      setSaveSuccess((prev) => ({ ...prev, [setting.id]: true }));
      setTimeout(() => {
        setSaveSuccess((prev) => ({ ...prev, [setting.id]: false }));
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to save ${setting.key}`
      );
    } finally {
      setSaving((prev) => ({ ...prev, [setting.id]: false }));
    }
  };

  const handleSaveCategory = async () => {
    const categorySettings = settingsForCategory;
    const changed = categorySettings.filter(
      (s) => editValues[s.id] !== s.value
    );
    if (changed.length === 0) return;

    for (const setting of changed) {
      await handleSave(setting);
    }
  };

  const settingsForCategory = settings.filter(
    (s) => s.category === activeCategory
  );

  const hasChangesInCategory = settingsForCategory.some(
    (s) => editValues[s.id] !== s.value
  );

  if (loading) {
    return (
      <div className="page settings-page">
        <h2>Settings</h2>
        <div className="settings-loading">Loading settings…</div>
        <DividendSettingsPanel />
      </div>
    );
  }

  if (error && settings.length === 0) {
    return (
      <div className="page settings-page">
        <h2>Settings</h2>
        <div className="settings-error">
          <p>{error}</p>
          <button className="settings-btn" onClick={loadSettings}>
            Retry
          </button>
        </div>
        <DividendSettingsPanel />
      </div>
    );
  }

  return (
    <div className="page settings-page">
      <h2>Settings</h2>
      <p>Configure thresholds, limits, colors, and display preferences.</p>

      {error && (
        <div className="settings-error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="settings-dismiss-btn">
            ✕
          </button>
        </div>
      )}

      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-label="Settings categories">
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={activeCategory === cat}
              className={`settings-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </nav>

        <div className="settings-panel" role="tabpanel">
          <div className="settings-panel-header">
            <h3>{CATEGORY_LABELS[activeCategory]}</h3>
            <button
              className="settings-btn settings-btn-primary"
              disabled={!hasChangesInCategory}
              onClick={handleSaveCategory}
            >
              Save All Changes
            </button>
          </div>

          <div className="settings-list">
            {settingsForCategory.map((setting) => (
              <div key={setting.id} className="settings-item">
                <div className="settings-item-info">
                  <label className="settings-item-key" htmlFor={`setting-${setting.id}`}>
                    {setting.key}
                  </label>
                  {setting.description && (
                    <span className="settings-item-desc">{setting.description}</span>
                  )}
                </div>
                <div className="settings-item-controls">
                  <input
                    id={`setting-${setting.id}`}
                    type="text"
                    className="settings-input"
                    value={editValues[setting.id] ?? setting.value}
                    onChange={(e) => handleValueChange(setting.id, e.target.value)}
                  />
                  <button
                    className={`settings-btn settings-btn-save ${saveSuccess[setting.id] ? 'success' : ''}`}
                    disabled={
                      editValues[setting.id] === setting.value ||
                      saving[setting.id]
                    }
                    onClick={() => handleSave(setting)}
                  >
                    {saving[setting.id]
                      ? '…'
                      : saveSuccess[setting.id]
                        ? '✓'
                        : 'Save'}
                  </button>
                </div>
              </div>
            ))}

            {settingsForCategory.length === 0 && (
              <p className="settings-empty">No settings in this category.</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Dividend Portfolio Settings (localStorage) ─── */}
      <DividendSettingsPanel />
    </div>
  );
}

/* ─── Dividend Portfolio Settings ──────────────────────────────────────── */

function DividendSettingsPanel() {
  const [divSettings, setDivSettings] = useState<DividendLocalSettings>(loadLocalSettings);
  const [saved, setSaved] = useState(false);

  const handleChange = (key: keyof DividendLocalSettings, value: number) => {
    setDivSettings((prev) => ({ ...prev, [key]: value }));
    saveLocalSetting(key, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const fields: { key: keyof DividendLocalSettings; label: string; desc: string; step: number }[] = [
    { key: 'spreadsAccountValue', label: 'Spreads Account Value', desc: 'Schwab spreads account value — used for portfolio heat and slot calculations (will auto-populate from broker API when connected)', step: 100 },
    { key: 'monthlyContribution', label: 'Monthly Deploy', desc: 'How much new capital deployed each month into dividend stocks', step: 50 },
    { key: 'annualExpenses', label: 'Annual Expenses', desc: 'Target annual living expenses for FI calculation', step: 1000 },
    { key: 'targetPositions', label: 'Target Positions', desc: 'Maximum number of stocks in dividend portfolio', step: 1 },
    { key: 'maxSinglePosition', label: 'Max Single Position (%)', desc: 'Maximum weight for any one stock', step: 1 },
  ];

  return (
    <div className="settings-dividend-section">
      <h3>Dividend Portfolio Settings</h3>
      <p className="settings-dividend-desc">These settings are stored locally and used by the Dividends dashboard.</p>
      {saved && <span className="settings-dividend-saved">✓ Saved</span>}
      <div className="settings-list">
        {fields.map((f) => (
          <div key={f.key} className="settings-item">
            <div className="settings-item-info">
              <label className="settings-item-key" htmlFor={`div-${f.key}`}>{f.label}</label>
              <span className="settings-item-desc">{f.desc}</span>
            </div>
            <div className="settings-item-controls">
              <input
                id={`div-${f.key}`}
                type="number"
                className="settings-input"
                value={divSettings[f.key]}
                onChange={(e) => handleChange(f.key, Number(e.target.value))}
                step={f.step}
                min={0}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SettingsPage;
