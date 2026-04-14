// types for the whole app - device models, protocols, etc.

export const DeviceType = {
  ROUTER: 'ROUTER',
  SWITCH: 'SWITCH',
  PLC: 'PLC',
  RTU: 'RTU',
  HMI: 'HMI',
  FIREWALL: 'FIREWALL',
  UNKNOWN: 'UNKNOWN'
} as const;
export type DeviceType = typeof DeviceType[keyof typeof DeviceType];

// supported discovery protocols
export const Protocol = {
  EIGRP: 'EIGRP',
  SNMPV3: 'SNMPv3',
  SYSLOG: 'Syslog',
  ARP: 'ARP',
  LAYER2: 'Layer2'
} as const;
export type Protocol = typeof Protocol[keyof typeof Protocol];

export interface NetworkDevice {
  id: string;
  name: string;
  ip: string;
  mac: string;
  type: DeviceType | string;
  os: string;
  uptime: string;
  status: 'online' | 'offline' | 'warning';
  lastSeen: string;
  isAuthorized: boolean;
  eigrpNeighbors: string[];
  // d3 positioning stuff
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface NetworkLink {
  source: string | NetworkDevice;
  target: string | NetworkDevice;
  type: 'physical' | 'logical';
  bandwidth: string;
  protocol: Protocol | string;
}

export interface TopologyData {
  nodes: NetworkDevice[];
  links: NetworkLink[];
}

export interface Alert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  deviceId?: string;  // links alert to a specific node on the map
}

export type ViewType = 'dashboard' | 'topology' | 'devices' | 'alerts' | 'settings';