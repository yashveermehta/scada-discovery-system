// App.tsx – SecureTopo SCADA Dashboard (College Edition)
// All views fully wired, search works, settings persist locally,
// network health chart, live clock, security score breakdown,
// export topology, protocol filter, real-time alert counter.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldCheck, Activity, LayoutDashboard, Map, Cpu,
  AlertTriangle, Settings, RefreshCw, Search, ChevronRight,
  Info, Shield, BarChart3, Download, Filter,
  CheckCircle, XCircle, Zap, Eye, Bell, X
} from 'lucide-react';
import { DeviceType } from './types';
import type { ViewType, TopologyData, NetworkDevice, Alert } from './types';
import { discoveryEngine } from './services/networkSimulation';
import { analyzeSecurityStatus } from './services/geminiService';
import TopologyMap from './components/TopologyMap';

// ─── Persistent settings (localStorage) ────────────────────────────────────
const SETTINGS_KEY = 'securetopo_settings';
const defaultSettings = {
  eigrp: true,
  snmpv3: true,
  arp: true,
  cdp: false,
  autoScan: false,
  scanInterval: 300,
  alertSound: true,
  darkMode: true,
  snmpSecLevel: 'AuthPriv',
};
function loadSettings() {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return defaultSettings; }
}
function saveSettings(s: typeof defaultSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function calcSecurityScore(nodes: NetworkDevice[], alerts: Alert[]) {
  const rogue = nodes.filter(n => !n.isAuthorized).length;
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const high = alerts.filter(a => a.severity === 'high').length;
  const offline = nodes.filter(n => n.status === 'offline').length;
  const total = nodes.length || 1;
  let score = 100;
  score -= rogue * 15;
  score -= critical * 8;
  score -= high * 4;
  score -= (offline / total) * 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreGrade(s: number) {
  if (s >= 90) return { grade: 'A', color: 'text-emerald-400' };
  if (s >= 80) return { grade: 'B', color: 'text-blue-400' };
  if (s >= 65) return { grade: 'C', color: 'text-amber-400' };
  return { grade: 'D', color: 'text-red-400' };
}

// ─── Sparkline chart ─────────────────────────────────────────────────────────
function Sparkline({ data, color = '#10b981' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 200, h = 40;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity={0.1} stroke="none" />
    </svg>
  );
}

// ─── Toast notification ──────────────────────────────────────────────────────
function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-700 text-slate-200 text-sm px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
      <Bell className="w-4 h-4 text-blue-400 flex-shrink-0" />
      <span>{msg}</span>
      <button onClick={onClose} className="text-slate-500 hover:text-white ml-2"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [topology, setTopology] = useState<TopologyData>({ nodes: [], links: [] });
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<NetworkDevice | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [securityAnalysis, setSecurityAnalysis] = useState<string>('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [filterType, setFilterType] = useState<string>('all');
  const [healthHistory, setHealthHistory] = useState<number[]>([98, 99, 100, 99, 98, 100, 100, 99, 100]);
  const autoScanRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [alerts, setAlerts] = useState<Alert[]>([
    { id: '1', timestamp: new Date(Date.now() - 120000).toISOString(), severity: 'medium', message: 'EIGRP neighbor change detected on CORP-CORE-R01 (10.0.0.1)' },
    { id: '2', timestamp: new Date(Date.now() - 60000).toISOString(), severity: 'low', message: 'SNMPv3 polling successful — PLANT-SW-L3 responded in 42ms' },
    { id: '3', timestamp: new Date(Date.now() - 30000).toISOString(), severity: 'high', message: 'RTU REMOTE-RTU-04 offline — last seen 24h ago. Check field connectivity.' },
  ]);

  // Health history ticker
  useEffect(() => {
    const t = setInterval(() => {
      setHealthHistory(prev => {
        const last = prev[prev.length - 1] ?? 99;
        const next = Math.min(100, Math.max(88, last + (Math.random() - 0.4) * 2));
        return [...prev.slice(-19), Math.round(next * 10) / 10];
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // Auto-scan
  useEffect(() => {
    if (autoScanRef.current) clearInterval(autoScanRef.current);
    if (settings.autoScan) {
      autoScanRef.current = setInterval(() => startScan(), settings.scanInterval * 1000);
    }
    return () => { if (autoScanRef.current) clearInterval(autoScanRef.current); };
  }, [settings.autoScan, settings.scanInterval]);

  const showToast = (msg: string) => setToast(msg);

  useEffect(() => { loadDemo(); }, []);

  const startScan = async () => {
    setIsScanning(true);
    showToast('Network scan initiated...');
    try {
      const newData = await discoveryEngine.runDiscoveryScan();
      setTopology({ ...newData });
      newData.nodes.forEach(node => {
        if (!node.isAuthorized) {
          const newAlert: Alert = {
            id: Math.random().toString(36).slice(2),
            timestamp: new Date().toISOString(),
            severity: 'critical',
            message: `Unauthorized device detected: ${node.mac} at ${node.ip} (${node.name})`,
            deviceId: node.id
          };
          setAlerts(prev => [newAlert, ...prev]);
        }
      });
      showToast(`Scan complete — ${newData.nodes.length} devices found`);
    } catch (error) {
      setAlerts(prev => [{
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toISOString(),
        severity: 'high',
        message: `Discovery scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }, ...prev]);
    } finally { setIsScanning(false); }
  };

  const handleAddDevice = (type: DeviceType, name: string) => {
    if (!name.trim()) return;
    const newData = discoveryEngine.addCustomDevice(type, name);
    setTopology({ ...newData });
    const newDevice = newData.nodes.find(n => n.name === name && n.type === type);
    const isRogue = type === DeviceType.UNKNOWN;
    const newAlert: Alert = {
      id: Math.random().toString(36).slice(2),
      timestamp: new Date().toISOString(),
      severity: isRogue ? 'critical' : 'medium',
      message: isRogue
        ? `ROGUE device injected into OT network: ${name}`
        : `New device manually provisioned: ${name} (${type})`,
      deviceId: newDevice?.id
    };
    setAlerts(prev => [newAlert, ...prev]);
    setActiveView('topology');
    showToast(isRogue ? `Rogue device "${name}" injected!` : `Device "${name}" added`);
  };

  const simulateIntrusion = () => {
    const newData = discoveryEngine.simulateIntrusion();
    setTopology({ ...newData });
    const rogue = newData.nodes[newData.nodes.length - 1];
    const newAlert: Alert = {
      id: Math.random().toString(36).slice(2),
      timestamp: new Date().toISOString(),
      severity: 'critical',
      message: `INTRUSION DETECTED — Unknown device ${rogue.mac} appeared on OT segment at ${rogue.ip}`,
      deviceId: rogue.id
    };
    setAlerts(prev => [newAlert, ...prev]);
    setActiveView('topology');
    showToast('Rogue device detected on OT segment!');
  };

  const loadDemo = async () => {
    setIsScanning(true);
    try {
      const newData = await discoveryEngine.loadDemo();
      setTopology({ ...newData });
    } catch { } finally { setIsScanning(false); }
  };

  const runAnalysis = async () => {
    setAnalysisLoading(true);
    const result = await analyzeSecurityStatus(topology, alerts);
    setSecurityAnalysis(result);
    setAnalysisLoading(false);
  };

  const exportTopology = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      device_count: topology.nodes.length,
      link_count: topology.links.length,
      nodes: topology.nodes,
      links: topology.links
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'securetopo-export.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('Topology exported as JSON');
  };

  const authorizeDevice = (device: NetworkDevice) => {
    const updatedNodes = topology.nodes.map(n =>
      n.id === device.id ? { ...n, isAuthorized: true, type: n.type === DeviceType.UNKNOWN ? 'WORKSTATION' : n.type } : n
    );
    setTopology({ ...topology, nodes: updatedNodes });
    setSelectedDevice(null);
    setAlerts(prev => prev.filter(a => a.deviceId !== device.id));
    showToast(`Device ${device.name} authorized as trusted`);
  };

  const blockDevice = (device: NetworkDevice) => {
    setTopology({
      nodes: topology.nodes.filter(n => n.id !== device.id),
      links: topology.links.filter(l => {
        const src = typeof l.source === 'string' ? l.source : (l.source as any).id;
        const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id;
        return src !== device.id && tgt !== device.id;
      })
    });
    setAlerts(prev => prev.filter(a => a.deviceId !== device.id));
    setSelectedDevice(null);
    showToast(`Device ${device.name} blocked and removed from topology`);
  };

  // Filtered / searched nodes
  const filteredNodes = useMemo(() => {
    let nodes = topology.nodes;
    if (filterType !== 'all') nodes = nodes.filter(n => n.type === filterType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      nodes = nodes.filter(n =>
        n.name.toLowerCase().includes(q) ||
        n.ip.includes(q) ||
        n.mac.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        n.os.toLowerCase().includes(q)
      );
    }
    return nodes;
  }, [topology.nodes, searchQuery, filterType]);

  const score = calcSecurityScore(topology.nodes, alerts);
  const { grade, color: gradeColor } = scoreGrade(score);
  const rogueCount = topology.nodes.filter(n => !n.isAuthorized).length;
  const criticalCount = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
  const offlineCount = topology.nodes.filter(n => n.status === 'offline').length;

  // ─── DASHBOARD VIEW ────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="p-4 flex flex-col h-full gap-3 overflow-auto">
      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <KpiCard label="Total Devices" value={topology.nodes.length.toString()} sub="All segments reachable" icon={<Cpu className="w-4 h-4 text-blue-400" />} trend="up" />
        <KpiCard label="Critical Alerts" value={criticalCount.toString()} sub={criticalCount > 0 ? 'Requires attention' : 'All clear'} icon={<AlertTriangle className={`w-4 h-4 ${criticalCount > 0 ? 'text-red-400' : 'text-emerald-400'}`} />} trend={criticalCount > 0 ? 'down' : 'up'} />
        <KpiCard label="Security Score" value={`${score}`} sub={`Grade: ${grade}`} icon={<ShieldCheck className="w-4 h-4 text-blue-400" />} trend={score >= 80 ? 'up' : 'down'} />
        <KpiCard label="Network Uptime" value={(healthHistory[healthHistory.length - 1] ?? 99).toFixed(1) + '%'} sub="Live monitoring" icon={<Activity className="w-4 h-4 text-emerald-400" />} trend="up" />
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
        {/* Topology Preview */}
        <div className="col-span-2 bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]/30 rounded-xl overflow-hidden flex flex-col relative group">
          <div className="px-4 py-2.5 border-b border-[var(--color-outline-variant)]/30 flex justify-between items-center flex-shrink-0 relative z-20 bg-[var(--color-surface-container-low)]">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Map className="w-3.5 h-3.5 text-[var(--color-secondary-container)]" />Live Topology</h3>
            <button onClick={() => setActiveView('topology')} className="text-[11px] text-[var(--color-primary)] hover:text-white">Full View →</button>
          </div>
          <div className="flex-1 min-h-0 pointer-events-none relative bg-[#070a12]">
             {/* Vertical Scan Line Background */}
            <div className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-[var(--color-primary)]/5 to-transparent pointer-events-none z-10 animate-scan"></div>
            <TopologyMap data={topology} onNodeClick={() => { }} />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Security Score Breakdown */}
          <div className="bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]/30 rounded-xl p-4 flex-1 overflow-auto">
            <h3 className="text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Security Score</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className={`text-5xl font-bold ${gradeColor}`}>{grade}</div>
              <div>
                <div className="text-2xl font-bold">{score}<span className="text-sm text-[var(--color-on-surface-variant)]/60">/100</span></div>
                <div className="text-[10px] text-[var(--color-on-surface-variant)]/60">Based on live telemetry</div>
              </div>
            </div>
            <div className="space-y-2">
              <ScoreRow label="Rogue devices" value={rogueCount} max={5} bad={rogueCount > 0} />
              <ScoreRow label="Critical alerts" value={criticalCount} max={10} bad={criticalCount > 0} />
              <ScoreRow label="Offline nodes" value={offlineCount} max={topology.nodes.length || 1} bad={offlineCount > 0} />
              <ScoreRow label="Auth coverage" value={topology.nodes.filter(n => n.isAuthorized).length} max={topology.nodes.length || 1} reverse />
            </div>
          </div>

          {/* Health Chart */}
          <div className="bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]/30 rounded-xl p-4 flex-shrink-0">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Network Health</h3>
              <span className="text-[10px] text-emerald-400 font-mono">{(healthHistory[healthHistory.length - 1] ?? 99).toFixed(1)}%</span>
            </div>
            <Sparkline data={healthHistory} color="var(--color-primary)" />
            <div className="text-[10px] text-[var(--color-on-surface-variant)]/60 mt-1">Last 20 readings · updates every 3s</div>
          </div>
        </div>
      </div>

      {/* Bottom: Recent Alerts */}
      <div className="bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]/30 rounded-xl flex-shrink-0">
        <div className="px-4 py-2.5 border-b border-[var(--color-outline-variant)]/30 flex justify-between items-center">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Bell className="w-3.5 h-3.5 text-amber-400" />Recent Security Events</h3>
          <button onClick={() => setActiveView('alerts')} className="text-[11px] text-[var(--color-primary)] hover:text-white">View All ({alerts.length}) →</button>
        </div>
        <div className="divide-y divide-[var(--color-outline-variant)]/30">
          {alerts.slice(0, 3).map(a => (
            <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-800/30 transition-colors">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : a.severity === 'high' ? 'bg-orange-500' : a.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} />
              <span className="text-xs text-slate-300 flex-1 truncate">{a.message}</span>
              <span className="text-[10px] text-slate-500 flex-shrink-0">{new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
          {alerts.length === 0 && <div className="px-4 py-4 text-xs text-slate-500 text-center">No events recorded</div>}
        </div>
      </div>
    </div>
  );

  // ─── TOPOLOGY VIEW ─────────────────────────────────────────────────────────
  const renderTopology = () => (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-52 border-r border-slate-800 bg-slate-900/40 flex flex-col p-3 gap-3 flex-shrink-0 overflow-y-auto">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Actions</div>
          <div className="space-y-1.5">
            <button onClick={startScan} disabled={isScanning} className="w-full flex items-center gap-2 px-3 py-2 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 rounded-lg text-xs font-semibold text-emerald-400 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning...' : 'Run Discovery'}
            </button>
            <button onClick={simulateIntrusion} className="w-full flex items-center gap-2 px-3 py-2 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 rounded-lg text-xs font-semibold text-red-400 transition-colors">
              <Zap className="w-3.5 h-3.5" />Simulate Intrusion
            </button>
            <button onClick={exportTopology} className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-300 transition-colors">
              <Download className="w-3.5 h-3.5" />Export JSON
            </button>
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Add Device</div>
          <AddDevicePanel onAdd={handleAddDevice} />
        </div>

        <div className="mt-auto">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Legend</div>
          <div className="space-y-1.5">
            {[['Router', '#3b82f6'], ['Switch', '#10b981'], ['PLC', '#f59e0b'], ['RTU', '#8b5cf6'], ['HMI', '#06b6d4'], ['Firewall', '#f97316'], ['Rogue', '#ef4444']].map(([l, c]) => (
              <div key={l} className="flex items-center gap-2 text-[10px] text-slate-400">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c as string }} />{l}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative bg-[#070a12] overflow-hidden">
        {/* Vertical Scan Line Background */}
        <div className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-[var(--color-primary)]/5 to-transparent pointer-events-none z-10 animate-scan"></div>
        <TopologyMap data={topology} onNodeClick={setSelectedDevice} />
        <div className="absolute bottom-4 left-4 bg-[#070a12]/80 backdrop-blur-md border border-[var(--color-outline-variant)]/10 rounded-lg px-4 py-4 text-[10px] text-[var(--color-on-surface-variant)] space-y-1.5 pointer-events-none z-20">
          <div className="font-headline text-[10px] uppercase font-bold tracking-[0.2em] text-[var(--color-primary)] mb-3">NODE GRAPH</div>
          <div className="flex justify-between gap-4"><span>Nodes:</span> <span className="text-white font-mono">{topology.nodes.length}</span></div>
          <div className="flex justify-between gap-4"><span>Links:</span> <span className="text-white font-mono">{topology.links.length}</span></div>
          <div className="flex justify-between gap-4"><span>Rogue:</span> <span className={rogueCount > 0 ? 'text-[var(--color-error)] font-mono' : 'text-emerald-400 font-mono'}>{rogueCount}</span></div>
        </div>
      </div>

      {/* Device detail panel */}
      {selectedDevice && (
        <div className="w-64 border-l border-slate-800 bg-slate-900/80 backdrop-blur flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-sm font-bold text-blue-400">Device Details</h3>
            <button onClick={() => setSelectedDevice(null)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-3 text-xs flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ background: !selectedDevice.isAuthorized ? '#ef4444' : selectedDevice.type === DeviceType.ROUTER ? '#3b82f6' : selectedDevice.type === DeviceType.SWITCH ? '#10b981' : '#64748b' }} />
              <span className="font-bold text-slate-200">{selectedDevice.name}</span>
            </div>
            {([
              ['IP Address', selectedDevice.ip],
              ['MAC Address', selectedDevice.mac],
              ['Device Type', selectedDevice.type],
              ['Operating System', selectedDevice.os],
              ['Uptime', selectedDevice.uptime],
              ['Status', selectedDevice.status],
              ['Last Seen', new Date(selectedDevice.lastSeen).toLocaleString()],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-slate-500 flex-shrink-0">{k}</span>
                <span className={`font-mono text-right text-[10px] break-all ${k === 'Status' ? (v === 'online' ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-300'}`}>{v}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-800">
              <div className={`flex items-center gap-2 ${selectedDevice.isAuthorized ? 'text-emerald-400' : 'text-red-400'}`}>
                {selectedDevice.isAuthorized ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                <span className="font-semibold text-[11px]">{selectedDevice.isAuthorized ? 'Authorized Device' : 'UNAUTHORIZED / ROGUE'}</span>
              </div>
            </div>
            {selectedDevice.eigrpNeighbors.length > 0 && (
              <div className="pt-2 border-t border-slate-800">
                <div className="text-slate-500 mb-1">EIGRP Neighbors</div>
                <div className="flex flex-wrap gap-1">
                  {selectedDevice.eigrpNeighbors.map(n => (
                    <span key={n} className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono">{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-slate-800 space-y-2">
            {!selectedDevice.isAuthorized && (
              <button onClick={() => authorizeDevice(selectedDevice)} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold text-white transition-colors flex items-center justify-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" />Authorize as Trusted
              </button>
            )}
            <button onClick={() => blockDevice(selectedDevice)} className="w-full py-2 bg-red-600 hover:bg-red-500 rounded-lg text-xs font-bold text-white transition-colors flex items-center justify-center gap-2">
              <XCircle className="w-3.5 h-3.5" />Block / Isolate Device
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ─── DEVICES VIEW ──────────────────────────────────────────────────────────
  const deviceTypes = ['all', ...Array.from(new Set(topology.nodes.map(n => n.type)))];

  const renderDevices = () => (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Device Inventory</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{filteredNodes.length} of {topology.nodes.length} shown</span>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-transparent text-xs text-slate-300 focus:outline-none">
              {deviceTypes.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>)}
            </select>
          </div>
          <button onClick={exportTopology} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition-colors">
            <Download className="w-3.5 h-3.5" />Export
          </button>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/50 border-b border-slate-800">
            <tr>
              {['Hostname', 'Type', 'IP Address', 'MAC Address', 'OS', 'Status', 'Auth', 'Uptime'].map(h => (
                <th key={h} className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredNodes.map(device => (
              <tr key={device.id} className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${!device.isAuthorized ? 'bg-red-500/5' : ''}`}
                onClick={() => { setSelectedDevice(device); setActiveView('topology'); }}>
                <td className="px-4 py-3 font-medium text-slate-200">{device.name}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] uppercase text-slate-300">{device.type}</span></td>
                <td className="px-4 py-3 font-mono text-xs text-blue-300">{device.ip}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{device.mac}</td>
                <td className="px-4 py-3 text-xs text-slate-400 max-w-[140px] truncate">{device.os}</td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1.5 text-xs ${device.status === 'online' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'}`} />{device.status}
                  </span>
                </td>
                <td className="px-4 py-3">{device.isAuthorized ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}</td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono">{device.uptime}</td>
              </tr>
            ))}
            {filteredNodes.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-sm">No devices match your filter</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ─── ALERTS VIEW ───────────────────────────────────────────────────────────
  const renderAlerts = () => (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">Security Event Log</h2>
          <p className="text-xs text-slate-500 mt-1">{alerts.length} total events · {alerts.filter(a => a.severity === 'critical').length} critical</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runAnalysis} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold text-white transition-colors">
            <Eye className="w-3.5 h-3.5" />Run Security Analysis
          </button>
          <button onClick={() => setAlerts([])} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-300 transition-colors">
            <X className="w-3.5 h-3.5" />Clear All
          </button>
        </div>
      </div>

      {(securityAnalysis || analysisLoading) && (
        <div className="mb-6 bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-blue-400">Security Analysis Report</h3>
          </div>
          {analysisLoading
            ? <div className="text-sm text-slate-400 animate-pulse">Analyzing network posture...</div>
            : <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{securityAnalysis}</pre>
          }
        </div>
      )}

      <div className="space-y-3 max-w-4xl">
        {alerts.map(alert => (
          <div key={alert.id} className={`p-4 rounded-xl border flex gap-4 hover:scale-[1.005] transition-all cursor-pointer ${
            alert.severity === 'critical' ? 'bg-red-500/5 border-red-500/30' :
            alert.severity === 'high' ? 'bg-orange-500/5 border-orange-500/30' :
            alert.severity === 'medium' ? 'bg-amber-500/5 border-amber-500/30' :
            'bg-slate-900 border-slate-800'}`}
            onClick={() => {
              if (alert.deviceId) {
                const node = topology.nodes.find(n => n.id === alert.deviceId);
                if (node) { setSelectedDevice(node); setActiveView('topology'); }
              }
            }}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
              alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
              alert.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
              alert.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
              'bg-slate-800 text-slate-400'}`}>
              {alert.severity === 'critical' || alert.severity === 'high' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start gap-4">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                  alert.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                  alert.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-slate-800 text-slate-400'}`}>{alert.severity}</span>
                <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{new Date(alert.timestamp).toLocaleString()}</span>
              </div>
              <p className="text-sm text-slate-300 mt-1.5">{alert.message}</p>
              {alert.deviceId && <div className="mt-1.5 text-[10px] text-blue-400 flex items-center gap-1">View in topology <ChevronRight className="w-3 h-3" /></div>}
            </div>
            <button onClick={e => { e.stopPropagation(); setAlerts(prev => prev.filter(a => a.id !== alert.id)); }} className="text-slate-600 hover:text-slate-400 flex-shrink-0 mt-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {alerts.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
            <div className="font-semibold">No security events</div>
            <div className="text-sm mt-1">Network is operating normally</div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── SETTINGS VIEW ─────────────────────────────────────────────────────────
  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    showToast('Settings saved');
  };

  const renderSettings = () => (
    <div className="p-8 max-w-2xl h-full overflow-y-auto">
      <h2 className="text-2xl font-bold mb-2">Discovery Settings</h2>
      <p className="text-sm text-slate-500 mb-8">All settings persist in browser storage across sessions.</p>

      <section className="mb-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Protocol Configuration</h3>
        <div className="space-y-2">
          <SettingsToggle label="EIGRP Adjacency Discovery" desc="Discover neighbors via EIGRP routing protocol" checked={settings.eigrp} onChange={v => updateSetting('eigrp', v)} />
          <SettingsToggle label="SNMPv3 Secure Polling" desc="Poll devices using authenticated SNMPv3" checked={settings.snmpv3} onChange={v => updateSetting('snmpv3', v)} />
          <SettingsToggle label="ARP/MAC Table Correlation" desc="Correlate Layer 2 ARP and MAC table data" checked={settings.arp} onChange={v => updateSetting('arp', v)} />
          <SettingsToggle label="CDP/LLDP (Legacy)" desc="Not supported on OT segment" checked={settings.cdp} onChange={v => updateSetting('cdp', v)} disabled />
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Scan Schedule</h3>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <SettingsToggle label="Auto-scan" desc="Automatically rediscover topology on interval" checked={settings.autoScan} onChange={v => updateSetting('autoScan', v)} />
          {settings.autoScan && (
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Scan interval</label>
              <select value={settings.scanInterval} onChange={e => updateSetting('scanInterval', Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value={60}>Every 1 minute</option>
                <option value={300}>Every 5 minutes</option>
                <option value={600}>Every 10 minutes</option>
                <option value={1800}>Every 30 minutes</option>
              </select>
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">SNMPv3 Credentials</h3>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Security Level</label>
            <select value={settings.snmpSecLevel} onChange={e => updateSetting('snmpSecLevel', e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option>AuthPriv (Recommended)</option>
              <option>AuthNoPriv</option>
              <option>NoAuthNoPriv</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Username</label>
              <input readOnly value="scada-admin" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Auth Protocol</label>
              <input readOnly value="SHA-256 / AES-128" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => showToast('Auth test passed — SNMPv3 responding normally')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold text-white transition-colors">
              Test Auth
            </button>
            <button onClick={() => showToast('Credential vault would open in production deployment')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 transition-colors">
              Update Keyring
            </button>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Security Baseline</h3>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h4 className="font-semibold text-slate-200">Approve Current Topology</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Marks all {topology.nodes.length} current devices as authorized. Any new device detected after this will be flagged as rogue.
              </p>
            </div>
            <button onClick={() => {
              const updatedNodes = topology.nodes.map(n => ({ ...n, isAuthorized: true }));
              setTopology({ ...topology, nodes: updatedNodes });
              showToast(`${topology.nodes.length} devices approved as baseline`);
            }} className="flex-shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold text-white flex items-center gap-2 transition-colors">
              <ShieldCheck className="w-4 h-4" />Approve as Baseline
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Interface</h3>
        <div className="space-y-2">
          <SettingsToggle label="Alert Sound Notifications" desc="Play sound on new critical alerts" checked={settings.alertSound} onChange={v => updateSetting('alertSound', v)} />
        </div>
      </section>
    </div>
  );

  // ─── MAIN LAYOUT ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#070a12] text-[var(--color-on-surface)] overflow-hidden font-body selection:bg-[var(--color-primary)] selection:text-[var(--color-on-primary)]">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col bg-[#070a12] border-r border-[#4d4637]/10 z-50 flex-shrink-0">
        <div className="p-6">
          <span className="text-[var(--color-primary)] font-black font-headline tracking-widest text-lg">NODE SPECTRUM</span>
          <p className="font-label text-[10px] text-[var(--color-on-surface-variant)]/40 mt-1 uppercase">Active Scanning</p>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem icon={<Map className="w-4 h-4" />} label="Topology View" active={activeView === 'topology'} onClick={() => setActiveView('topology')} />
          <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Network Dashboard" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
          <NavItem icon={<Cpu className="w-4 h-4" />} label="Device Matrix" active={activeView === 'devices'} onClick={() => setActiveView('devices')} />
          <NavItem icon={<AlertTriangle className="w-4 h-4" />} label="Security Feed" active={activeView === 'alerts'} onClick={() => setActiveView('alerts')} badge={criticalCount} />
          <NavItem icon={<Settings className="w-4 h-4" />} label="System Config" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
        </nav>

        <div className="p-6 mt-auto">
          <button onClick={startScan} disabled={isScanning} className="w-full py-3 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-headline font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-transform disabled:opacity-50">
            {isScanning ? 'SCANNING...' : 'FORCE SCAN'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden relative p-8 bg-[#070a12]">
        <header className="flex justify-between items-end mb-8 flex-shrink-0">
          <div>
            <h1 className="font-headline text-4xl font-bold text-[var(--color-primary)] tracking-tighter uppercase">
              {activeView === 'dashboard' ? 'Network Dashboard' : activeView === 'topology' ? 'Topology View' : activeView === 'devices' ? 'Device Matrix' : activeView === 'alerts' ? 'Security Feed' : 'System Config'}
            </h1>
            <p className="font-label text-xs text-[var(--color-on-surface-variant)]/60 mt-2 uppercase">SYSTEM SECURE // NODES: {topology.nodes.length} ACTIVE // {rogueCount} UNIDENTIFIED</p>
          </div>
          <div className="flex gap-4 items-end">
             <div className="relative w-64 h-[52px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)]/40 w-4 h-4" />
              <input value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); if (activeView !== 'devices') setActiveView('devices'); }}
                type="text" placeholder="Search IP, MAC..."
                className="w-full h-full bg-[var(--color-surface-container-low)] border-b-2 border-transparent focus:border-[var(--color-primary)] rounded-none pl-10 pr-4 text-sm focus:outline-none transition-all placeholder-[var(--color-on-surface-variant)]/40 text-[var(--color-on-surface)]" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)] hover:text-white"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="bg-[var(--color-surface-container-low)] px-4 py-2 border-l-2 border-[var(--color-primary)] h-[52px] flex flex-col justify-center">
              <span className="font-label text-[10px] text-[var(--color-on-surface-variant)]/40 block uppercase">Uptime</span>
              <span className="font-headline text-lg font-bold">{(healthHistory[healthHistory.length - 1] ?? 99).toFixed(1)}%</span>
            </div>
            <div className="bg-[var(--color-surface-container-low)] px-4 py-2 border-l-2 border-[var(--color-error)] h-[52px] flex flex-col justify-center">
              <span className="font-label text-[10px] text-[var(--color-on-surface-variant)]/40 block uppercase">Anomalies</span>
              <span className="font-headline text-lg font-bold text-[var(--color-error)]">{rogueCount < 10 ? `0${rogueCount}` : rogueCount}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          {activeView === 'dashboard' && renderDashboard()}
          {activeView === 'topology' && renderTopology()}
          {activeView === 'devices' && renderDevices()}
          {activeView === 'alerts' && renderAlerts()}
          {activeView === 'settings' && renderSettings()}
        </div>
      </main>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, trend }: { label: string; value: string; sub: string; icon: React.ReactNode; trend: 'up' | 'down' }) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition-colors">
      <div className="flex justify-between items-start">
        <p className="text-[11px] text-slate-500 font-medium">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className={`text-[10px] mt-0.5 ${trend === 'up' ? 'text-emerald-500' : 'text-red-400'}`}>{sub}</p>
    </div>
  );
}

function ScoreRow({ label, value, max, bad, reverse }: { label: string; value: number; max: number; bad?: boolean; reverse?: boolean }) {
  const pct = Math.min(100, (value / (max || 1)) * 100);
  const barColor = reverse ? 'bg-emerald-500' : (bad && value > 0 ? 'bg-red-500' : 'bg-emerald-500');
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-slate-500">{label}</span>
        <span className={bad && value > 0 && !reverse ? 'text-red-400' : 'text-slate-400'}>{value}{reverse ? `/${max}` : ''}</span>
      </div>
      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AddDevicePanel({ onAdd }: { onAdd: (type: DeviceType, name: string) => void }) {
  const [type, setType] = useState<DeviceType>(DeviceType.PLC);
  const [name, setName] = useState('');
  return (
    <div className="space-y-2">
      <select value={type} onChange={e => setType(e.target.value as DeviceType)}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500">
        {Object.values(DeviceType).map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Device name..."
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onAdd(type, name); setName(''); } }}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500" />
      <button onClick={() => { if (name.trim()) { onAdd(type, name); setName(''); } }}
        className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors">
        Add to Network
      </button>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, badge }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <div onClick={onClick} className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${active ? 'bg-[var(--color-primary-container)]/10 text-[var(--color-primary)]' : 'text-[var(--color-on-surface-variant)]/40 hover:bg-[var(--color-surface-container-high)]'}`}>
      <div className="flex items-center gap-4">
        {icon}
        <span className="font-label text-xs uppercase tracking-tighter">{label}</span>
      </div>
      {badge !== undefined && badge > 0 && <span className="font-label text-[10px] text-[var(--color-error)] font-bold">{badge}</span>}
    </div>
  );
}

function SettingsToggle({ label, desc, checked, onChange, disabled }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl ${disabled ? 'opacity-40' : ''}`}>
      <div>
        <div className="text-sm font-medium text-slate-200">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
      <button disabled={disabled} onClick={() => onChange(!checked)} className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ml-4 ${checked ? 'bg-blue-600' : 'bg-slate-700'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

export default App;
