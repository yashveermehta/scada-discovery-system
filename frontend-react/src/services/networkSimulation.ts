// networkSimulation.ts
// this is the main discovery engine - either calls the real backend 
// or falls back to hardcoded demo data for presentations
// most of the demo was modeled after a GAIL pipeline SCADA setup

import { DeviceType, Protocol } from '../types';
import type { NetworkDevice, NetworkLink, TopologyData } from '../types';
import { apiService } from './apiService';
import type { ApiTopologyResponse } from './apiService';

// converts the flask api response format into our frontend types
function convertApiToTopology(apiData: ApiTopologyResponse): TopologyData {
  if (!apiData || !apiData.nodes) {
    return { nodes: [], links: [] };
  }

  const nodes: NetworkDevice[] = apiData.nodes.map((node: any) => ({
    id: node.id || node.ip || 'unknown',
    name: node.hostname || node.name || node.id || node.ip || 'Unknown',
    ip: node.ip || node.id || '0.0.0.0',
    mac: node.mac || '00:00:00:00:00:00',
    type: mapDeviceType(node.type || 'unknown'),
    os: node.description || node.os || 'Unknown',
    uptime: node.uptime || '0h',
    status: (node.status === 'down' ? 'offline' : 'online') as 'online' | 'offline',
    lastSeen: new Date().toISOString(),
    isAuthorized: node.isAuthorized ?? Boolean(node.is_authorized) ?? false,
    eigrpNeighbors: []
  }));

  // figure out each node's neighbors from the edge list
  if (apiData.edges) {
    nodes.forEach(node => {
      const neighbors = apiData.edges
        .filter((e: any) => e.source === node.id || e.target === node.id)
        .map((e: any) => e.source === node.id ? e.target : e.source);
      node.eigrpNeighbors = neighbors;
    });
  }

  const links: NetworkLink[] = (apiData.edges || []).map((edge: any) => ({
    source: edge.source,
    target: edge.target,
    type: (edge.type === 'Layer3' ? 'logical' : 'physical') as 'physical' | 'logical',
    bandwidth: edge.bandwidth || 'Unknown',
    protocol: mapProtocol(edge.protocol || 'EIGRP')
  }));

  return { nodes, links };
}

function mapDeviceType(type: string): DeviceType {
  const lower = type.toLowerCase();
  if (lower.includes('router')) return DeviceType.ROUTER;
  if (lower.includes('switch')) return DeviceType.SWITCH;
  if (lower.includes('firewall')) return DeviceType.FIREWALL;
  if (lower.includes('plc') || lower.includes('rtu')) return DeviceType.PLC;
  if (lower.includes('hmi')) return DeviceType.HMI;
  return DeviceType.UNKNOWN;
}

function mapProtocol(protocol: string): Protocol {
  const upper = protocol.toUpperCase();
  if (upper.includes('EIGRP')) return Protocol.EIGRP;
  if (upper.includes('SNMP')) return Protocol.SNMPV3;
  if (upper.includes('ARP')) return Protocol.ARP;
  if (upper.includes('SYSLOG')) return Protocol.SYSLOG;
  return Protocol.EIGRP;
}


// ========================================================
// demo topology data - modeled after a GAIL pipeline SCADA setup
// used when backend isnt running or for classroom demos
// ========================================================

const DEMO_DEVICES: NetworkDevice[] = [
  // corporate IT side
  {
    id: 'core-router',
    name: 'CORP-CORE-R01',
    ip: '10.0.0.1',
    mac: '00:00:5E:00:01:01',
    type: DeviceType.ROUTER,
    os: 'Cisco IOS-XE 17.6',
    uptime: '45d 12h',
    status: 'online',
    lastSeen: new Date().toISOString(),
    isAuthorized: true,
    eigrpNeighbors: ['dist-router', 'firewall-main']
  },
  {
    id: 'firewall-main',
    name: 'CORP-FW-ASA',
    ip: '10.0.0.254',
    mac: '00:00:5E:00:01:02',
    type: DeviceType.FIREWALL,
    os: 'Cisco ASA 9.16',
    uptime: '120d 4h',
    status: 'online',
    lastSeen: new Date().toISOString(),
    isAuthorized: true,
    eigrpNeighbors: ['core-router', 'scada-gateway']
  },

  // scada dmz / control center
  {
    id: 'scada-gateway',
    name: 'SCADA-GW-01',
    ip: '192.168.1.1',
    mac: '00:00:5E:00:05:01',
    type: DeviceType.ROUTER,
    os: 'Cisco ISR 4000',
    uptime: '365d 2h',       // this one's been up forever lol
    status: 'online',
    lastSeen: new Date().toISOString(),
    isAuthorized: true,
    eigrpNeighbors: ['firewall-main', 'plant-dist-switch']
  },
  {
    id: 'scada-server',
    name: 'SCADA-HISTORIAN',
    ip: '192.168.1.10',
    mac: '00:00:5E:00:05:10',
    type: DeviceType.UNKNOWN,  // its a server, not a specific OT device
    os: 'Windows Server 2019',
    uptime: '45d 1h',
    status: 'online',
    lastSeen: new Date().toISOString(),
    isAuthorized: true,
    eigrpNeighbors: []
  },
  {
    id: 'hmi-main',
    name: 'MAIN-CONTROL-HMI',
    ip: '192.168.1.20',
    mac: '00:00:5E:00:05:20',
    type: DeviceType.HMI,
    os: 'Siemens WinCC',
    uptime: '12d 5h',
    status: 'online',
    lastSeen: new Date().toISOString(),
    isAuthorized: true,
    eigrpNeighbors: []
  },

  // plant floor OT segment
  {
    id: 'plant-dist-switch',
    name: 'PLANT-SW-L3',
    ip: '172.16.10.1',
    mac: '00:00:5E:00:0A:01',
    type: DeviceType.SWITCH,
    os: 'Cisco Catalyst 9300',
    uptime: '200d 6h',
    status: 'online',
    lastSeen: new Date().toISOString(),
    isAuthorized: true,
    eigrpNeighbors: ['scada-gateway']
  },
  {
    id: 'plc-process-01',
    name: 'PLC-MIXER-01',
    ip: '172.16.10.101',
    mac: '00:00:5E:00:0A:11',
    type: DeviceType.PLC,
    os: 'Allen-Bradley ControlLogix',
    uptime: '400d 12h',
    status: 'online',
    lastSeen: new Date().toISOString(),
    isAuthorized: true,
    eigrpNeighbors: []
  },
  {
    id: 'plc-process-02',
    name: 'PLC-PUMP-02',
    ip: '172.16.10.102',
    mac: '00:00:5E:00:0A:12',
    type: DeviceType.PLC,
    os: 'Siemens S7-1200',
    uptime: '120d 0h',
    status: 'online',
    lastSeen: new Date().toISOString(),
    isAuthorized: true,
    eigrpNeighbors: []
  },
  {
    id: 'rtu-remote',
    name: 'REMOTE-RTU-04',
    ip: '172.16.20.50',
    mac: '00:00:5E:00:0B:01',
    type: DeviceType.RTU,
    os: 'Emerson ROC800',
    uptime: '50d 3h',
    status: 'offline',       // simulating a field outage
    lastSeen: new Date(Date.now() - 86400000).toISOString(),
    isAuthorized: true,
    eigrpNeighbors: []
  }
];

// this gets injected when user clicks "simulate intrusion"
const ROGUE_TEMPLATE: NetworkDevice = {
  id: 'rogue-laptop',
  name: 'UNKNOWN-LAPTOP',
  ip: '172.16.10.199',
  mac: 'DE:AD:BE:EF:00:00',
  type: DeviceType.UNKNOWN,
  os: 'Unknown',
  uptime: '0d 1h',
  status: 'online',
  lastSeen: new Date().toISOString(),
  isAuthorized: false,
  eigrpNeighbors: []
};

// network links between demo devices
const DEMO_LINKS: NetworkLink[] = [
  // eigrp backbone
  { source: 'core-router', target: 'firewall-main', type: 'logical', bandwidth: '10Gbps', protocol: Protocol.EIGRP },
  { source: 'firewall-main', target: 'scada-gateway', type: 'logical', bandwidth: '1Gbps', protocol: Protocol.EIGRP },

  // scada network segment
  { source: 'scada-gateway', target: 'plant-dist-switch', type: 'physical', bandwidth: '1Gbps', protocol: Protocol.SNMPV3 },
  { source: 'scada-gateway', target: 'scada-server', type: 'physical', bandwidth: '1Gbps', protocol: Protocol.SNMPV3 },
  { source: 'plant-dist-switch', target: 'hmi-main', type: 'physical', bandwidth: '100Mbps', protocol: Protocol.SNMPV3 },

  // plant floor stuff
  { source: 'plant-dist-switch', target: 'plc-process-01', type: 'physical', bandwidth: '100Mbps', protocol: Protocol.SNMPV3 },
  { source: 'plant-dist-switch', target: 'plc-process-02', type: 'physical', bandwidth: '100Mbps', protocol: Protocol.SNMPV3 },
  { source: 'plant-dist-switch', target: 'rtu-remote', type: 'physical', bandwidth: '56Kbps', protocol: Protocol.SNMPV3 }
];

// rogue always connects to the main switch (most realistic attack vector)
const ROGUE_LINK_TEMPLATE: NetworkLink = { source: 'plant-dist-switch', target: 'rogue-laptop', type: 'physical', bandwidth: '1Gbps', protocol: Protocol.ARP };

export class NetworkDiscoveryEngine {
  private topology: TopologyData = { nodes: [], links: [] };

  getTopology(): TopologyData {
    return this.topology;
  }

  // tries to use the real backend first, falls back gracefully
  async runDiscoveryScan(seedDevices?: string[]): Promise<TopologyData> {
    try {
      const apiData = await apiService.startDiscovery(seedDevices);
      this.topology = convertApiToTopology(apiData);
      return this.topology;
    } catch (error) {
      console.error('Discovery failed, keeping existing topology:', error);
      return this.topology;
    }
  }

  // loads the hardcoded demo - no backend needed
  async loadDemo(): Promise<TopologyData> {
    this.topology = {
      nodes: [...DEMO_DEVICES],
      links: [...DEMO_LINKS]
    };
    return this.topology;
  }

  async refreshTopology(): Promise<TopologyData> {
    try {
      const apiData = await apiService.getTopology();
      this.topology = convertApiToTopology(apiData);
      return this.topology;
    } catch (error) {
      console.error('Refresh failed:', error);
      return this.topology;
    }
  }

  // injects a fake rogue device for pen-testing demos
  // each call creates a unique one so you can spam it
  simulateIntrusion(): TopologyData {
    const rid = Math.floor(Math.random() * 999);
    const rogueId = `rogue-laptop-${rid}`;

    const newRogue: NetworkDevice = {
      ...ROGUE_TEMPLATE,
      id: rogueId,
      name: `UNKNOWN-LAPTOP-${rid}`,
      ip: `172.16.10.${100 + Math.floor(Math.random() * 150)}`,
      mac: `DE:AD:BE:EF:${Math.floor(Math.random() * 99)}:${Math.floor(Math.random() * 99)}`,
      lastSeen: new Date().toISOString()
    };

    const newLink: NetworkLink = {
      ...ROGUE_LINK_TEMPLATE,
      target: rogueId
    };

    this.topology = {
      nodes: [...this.topology.nodes, newRogue],
      links: [...this.topology.links, newLink]
    };
    return this.topology;
  }

  // lets users add custom devices from the provisioning panel
  addCustomDevice(type: DeviceType, name: string): TopologyData {
    const id = `custom-${Math.random().toString(36).substr(2, 9)}`;
    const isRogue = type === DeviceType.UNKNOWN;
    const randHex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');

    const newDevice: NetworkDevice = {
      id,
      name,
      ip: `172.16.99.${Math.floor(Math.random() * 200) + 1}`,
      mac: `02:00:00:${randHex()}:${randHex()}:${randHex()}`,
      type,
      os: 'Custom Device',
      uptime: '0h 1m',
      status: 'online',
      lastSeen: new Date().toISOString(),
      isAuthorized: !isRogue,
      eigrpNeighbors: []
    };

    // hook it up to the plant switch
    const newLink: NetworkLink = {
      source: 'plant-dist-switch',
      target: id,
      type: 'physical',
      bandwidth: '100Mbps',
      protocol: isRogue ? Protocol.ARP : Protocol.SNMPV3
    };

    this.topology = {
      nodes: [...this.topology.nodes, newDevice],
      links: [...this.topology.links, newLink]
    };

    return this.topology;
  }
}

// single instance used across the app
export const discoveryEngine = new NetworkDiscoveryEngine();
