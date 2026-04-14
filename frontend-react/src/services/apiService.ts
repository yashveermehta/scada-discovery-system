// apiService.ts - handles all communication with the flask backend
// if the backend is down, most of the app still works via demo mode

const API_BASE_URL = 'http://127.0.0.1:5000/api';

// response shape from the backend (python uses snake_case)
export interface ApiTopologyResponse {
  nodes: Array<{
    id?: string;
    ip?: string;
    hostname?: string;
    type?: string;
    description?: string;
    location?: string;
    uptime?: string;
    contact?: string;
    mac?: string;
    discovered_at?: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    protocol?: string;
    type?: string;
    bandwidth?: string;
    interface?: string;
  }>;
  statistics?: {
    total_devices: number;
    total_connections: number;
    failed_devices: number;
    discovery_time?: number;
  };
}

export const apiService = {
  // get current discovered topology
  async getTopology(): Promise<ApiTopologyResponse> {
    const response = await fetch(`${API_BASE_URL}/topology`);
    if (!response.ok) {
      throw new Error('Failed to fetch topology');
    }
    return await response.json();
  },

  // kick off a new snmp/eigrp discovery scan
  async startDiscovery(seedDevices?: string[]): Promise<ApiTopologyResponse> {
    const response = await fetch(`${API_BASE_URL}/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed_devices: seedDevices })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Discovery failed');
    }
    const result = await response.json();
    return result.topology || result;
  },

  // load preset demo data for presentations
  async loadDemo(): Promise<ApiTopologyResponse> {
    const response = await fetch(`${API_BASE_URL}/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      throw new Error('Failed to load demo');
    }
    const result = await response.json();
    return result.topology || result;
  },

  async getDeviceInfo(ip: string) {
    const response = await fetch(`${API_BASE_URL}/device/${ip}`);
    if (!response.ok) {
      throw new Error('Device not found');
    }
    return await response.json();
  },

  async getStatus() {
    const response = await fetch(`${API_BASE_URL}/status`);
    if (!response.ok) {
      throw new Error('Failed to get status');
    }
    return await response.json();
  },

  // mark the current topology as "known good" baseline
  async approveTopology() {
    const response = await fetch(`${API_BASE_URL}/approve`, {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error('Failed to approve topology');
    }
    return await response.json();
  },

  // authorize a specific device (mark it as trusted)
  async authorizeDevice(deviceId: string) {
    const response = await fetch(`${API_BASE_URL}/authorize/${deviceId}`, {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error('Failed to authorize device');
    }
    return await response.json();
  }
};
