import { useEffect, useState, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { fetchSettings, updateSetting } from '@/lib/settings';
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
    </div>
  );
}

export default SettingsPage;
