import React, { useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { useGameSettings } from '../useGameSettings';
import { 
  Moon, Sun, Monitor, Lock, Globe, Save, RotateCcw,
  CheckCircle2, Activity, AlertTriangle, CreditCard, FileText,
  UserPlus, X
} from 'lucide-react';
import type { AppSettings, GameSetting, PaymentConfig } from '../../../entities/tournament/types';
import { useTheme } from '../../theme/ThemeProvider';

// Default settings as per CRM-B
const DEFAULT_SETTINGS: AppSettings = {
    theme: 'system',
    maintenanceMode: false,
    externalAdminUrl: '',
    paymentConfig: {
        providerName: 'Stripe',
        apiKey: '',
        apiSecret: '',
        isActive: false,
        mode: 'test',
        webhookUrl: ''
    },
    games: [
        { id: 'ai', name: 'Play against the AI', isActive: true },
        { id: 'human', name: 'Play against humans', isActive: true }
    ],
    legalConfig: {
        termsVersion: '1.0',
        privacyVersion: '1.0',
        requireKycForWithdrawal: true
    },
    tournamentRules: 'Standard Backgammon Rules apply.'
};

export const SettingsPanel: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { 
    games: globalGames, 
    setGames: setGlobalGames, 
    maintenanceAllowlist, 
    updateMaintenanceAllowlist, 
    updateGameStatus, 
    tournamentRules: globalTournamentRules, 
    updateTournamentRules 
  } = useGameSettings();
  
  // Local state for allowlist input
  const [newAllowlistEmail, setNewAllowlistEmail] = useState('');
  
  // Initialize local settings
  const [localSettings, setLocalSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    games: globalGames,
    theme: theme as 'light' | 'dark' | 'system',
    tournamentRules: globalTournamentRules
  }));

  // Sync local settings with global changes (e.g. from Supabase or other admins)
  // We use the "Adjusting state during render" pattern to avoid cascading renders (React 19 compliant)
  const currentGlobalRules = globalTournamentRules ?? '';
  const [prevGlobalRules, setPrevGlobalRules] = useState(currentGlobalRules);
  if (currentGlobalRules !== prevGlobalRules) {
    setPrevGlobalRules(currentGlobalRules);
    setLocalSettings(prev => ({
       ...prev,
       tournamentRules: globalTournamentRules
    }));
  }

  // Derived state for UI to ensure it always matches global games state
  const activeMaintenanceMode = globalGames.length > 0 && globalGames.every(g => !g.isActive);

  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [rulesSaved, setRulesSaved] = useState(false);

  const handleGameToggle = (gameId: string) => {
    const game = globalGames.find(g => g.id === gameId);
    if (game) {
        updateGameStatus(gameId, !game.isActive);
    }
  };

  const handleMaintenanceToggle = () => {
    const newMaintenanceMode = !activeMaintenanceMode;
    const newGames = globalGames.map(game => ({ 
      ...game, 
      isActive: !newMaintenanceMode 
    }));
    setGlobalGames(newGames);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings({ ...localSettings, externalAdminUrl: e.target.value });
  };

  const handleRulesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalSettings({ ...localSettings, tournamentRules: e.target.value });
  };

  const saveRules = async () => {
    await updateTournamentRules(localSettings.tournamentRules);
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 3000);
  };

  const handlePaymentConfigChange = (field: keyof PaymentConfig, value: string | boolean) => {
      setLocalSettings(prev => ({
          ...prev,
          paymentConfig: {
              ...prev.paymentConfig,
              [field]: value
          }
      }));
  };

  const updatePassword = async () => {
    setPasswordStatus('idle');
    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordStatus('error');
      setPasswordMessage('New passwords do not match');
      return;
    }
    if (passwordForm.new.length < 6) {
      setPasswordStatus('error');
      setPasswordMessage('Password must be at least 6 characters');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.new
      });
      if (error) throw error;
      
      setPasswordStatus('success');
      setPasswordMessage('Password updated successfully');
      setPasswordForm({ current: '', new: '', confirm: '' });
      setTimeout(() => setPasswordStatus('idle'), 3000);
    } catch (err: unknown) {
      setPasswordStatus('error');
      const message = err instanceof Error ? err.message : 'Failed to update password';
      setPasswordMessage(message);
    }
  };

  const addToAllowlist = async () => {
      if (!newAllowlistEmail || !newAllowlistEmail.includes('@')) return;
      if (maintenanceAllowlist.includes(newAllowlistEmail)) return;
      
      const updated = [...maintenanceAllowlist, newAllowlistEmail];
      await updateMaintenanceAllowlist(updated);
      setNewAllowlistEmail('');
  };

  const removeFromAllowlist = async (email: string) => {
      const updated = maintenanceAllowlist.filter(e => e !== email);
      await updateMaintenanceAllowlist(updated);
  };

  return (
    <div className="space-y-6">
      {/* System Controls */}
      <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">System Controls</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-medium">Global Maintenance</h3>
                <p className="text-sm text-slate-400">Suspend all game activity</p>
              </div>
              <button
                onClick={handleMaintenanceToggle}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  activeMaintenanceMode ? 'bg-red-500' : 'bg-slate-600'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                  activeMaintenanceMode ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
            {activeMaintenanceMode && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p>Maintenance mode is active. Only users in the allowlist can access the application.</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Game Toggles</h3>
            <div className="space-y-2">
              {globalGames.map((game: GameSetting) => (
                <div key={game.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                  <span className="text-slate-200">{game.name}</span>
                  <button
                    onClick={() => handleGameToggle(game.id)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      game.isActive ? 'bg-cyan-500' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
                      game.isActive ? 'left-5.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Maintenance Allowlist */}
      <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <Lock className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">Maintenance Allowlist</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="email"
              value={newAllowlistEmail}
              onChange={(e) => setNewAllowlistEmail(e.target.value)}
              placeholder="admin@example.com"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={addToAllowlist}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Add
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {maintenanceAllowlist.map((email) => (
              <div key={email} className="flex items-center justify-between p-2 bg-slate-900/50 rounded border border-slate-700 group">
                <span className="text-sm text-slate-300 truncate">{email}</span>
                <button
                  onClick={() => removeFromAllowlist(email)}
                  className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {maintenanceAllowlist.length === 0 && (
              <p className="text-sm text-slate-500 italic col-span-full">No users in the allowlist.</p>
            )}
          </div>
        </div>
      </section>

      {/* Display Settings */}
      <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <Monitor className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">Display Settings</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['light', 'dark', 'system'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTheme(m)}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 capitalize ${
                theme === m 
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' 
                  : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              {m === 'light' && <Sun className="w-6 h-6" />}
              {m === 'dark' && <Moon className="w-6 h-6" />}
              {m === 'system' && <Monitor className="w-6 h-6" />}
              <span className="text-xs font-semibold">{m}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Payment Gateway Integration */}
      <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-emerald-500" /> Payment Gateway Integration
            </h2>
            <button 
                onClick={() => handlePaymentConfigChange('isActive', !localSettings.paymentConfig.isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${localSettings.paymentConfig.isActive ? 'bg-emerald-500' : 'bg-slate-600'}`}
            >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${localSettings.paymentConfig.isActive ? 'left-6' : 'left-1'}`} />
            </button>
        </div>
        
        <div className={`space-y-4 ${!localSettings.paymentConfig.isActive ? 'opacity-50 pointer-events-none' : ''}`}>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Provider Name</label>
                    <input 
                        type="text" 
                        value={localSettings.paymentConfig.providerName}
                        onChange={(e) => handlePaymentConfigChange('providerName', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                    />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Webhook URL</label>
                    <input 
                        type="text" 
                        value={localSettings.paymentConfig.webhookUrl}
                        onChange={(e) => handlePaymentConfigChange('webhookUrl', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                    />
                </div>
             </div>
             <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">API Public Key</label>
                <input 
                    type="text" 
                    value={localSettings.paymentConfig.apiKey}
                    onChange={(e) => handlePaymentConfigChange('apiKey', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">API Secret Key</label>
                <input 
                    type="password" 
                    value={localSettings.paymentConfig.apiSecret}
                    onChange={(e) => handlePaymentConfigChange('apiSecret', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
            </div>
        </div>
      </section>

      {/* Official Tournament Rules */}
      <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-semibold text-white">Official Tournament Rules</h2>
          </div>
          <div className="flex items-center gap-4">
            {rulesSaved && (
              <span className="text-emerald-400 text-sm flex items-center gap-1 animate-pulse">
                <CheckCircle2 className="w-4 h-4" />
                Saved
              </span>
            )}
            <button
              onClick={saveRules}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-all font-medium"
            >
              <Save className="w-4 h-4" />
              Save Rules
            </button>
          </div>
        </div>
        <textarea
          value={localSettings.tournamentRules}
          onChange={handleRulesChange}
          placeholder="Enter the official tournament rules here..."
          className="w-full h-80 bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-sm resize-none"
        />
      </section>

      {/* Administration URL */}
      <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">External Administration</h2>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={localSettings.externalAdminUrl}
            onChange={handleUrlChange}
            placeholder="https://legacy-admin.example.com"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={() => setLocalSettings(prev => ({ ...prev }))}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Security Settings */}
      <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <Lock className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">Security Settings</h2>
        </div>

        <div className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">New Admin Password</label>
            <input
              type="password"
              value={passwordForm.new}
              onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Confirm Password</label>
            <input
              type="password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          
          {passwordStatus !== 'idle' && (
            <div className={`p-3 rounded-lg text-sm ${
              passwordStatus === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {passwordMessage}
            </div>
          )}

          <button
            onClick={updatePassword}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Update Admin Password
          </button>
        </div>
      </section>
      
      {/* Footer Branding */}
      <div className="pt-8 pb-4 text-center border-t border-slate-700/50">
        <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em] font-medium font-mono text-center">
          \u00a9 2026 ANTIGRAVITY SOLUTIONS \u2022 CRM LAYER PRO MAX
        </p>
      </div>
    </div>
  );
};
