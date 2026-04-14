"""
Topology Discovery Engine
Discovers network topology using SNMP and EIGRP routing information
"""

import networkx as nx
from .snmp_client import SNMPClient
from backend.core.logger import setup_logger
from backend.core.config_loader import get_config
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

class TopologyDiscovery:
    """
    Main topology discovery engine
    Uses SNMP to discover devices and build network graph
    """
    
    # EIGRP MIB OIDs (Cisco-specific)
    EIGRP_PEER_TABLE = '1.3.6.1.4.1.9.9.449.1.4.1.1'
    EIGRP_PEER_ADDR = '1.3.6.1.4.1.9.9.449.1.4.1.1.3'  # Neighbor IP
    
    # IP Routing Table OIDs
    IP_ROUTE_DEST = '1.3.6.1.2.1.4.21.1.1'
    IP_ROUTE_NEXT_HOP = '1.3.6.1.2.1.4.21.1.7'
    
    def __init__(self):
        """Initialize topology discovery engine"""
        self.config = get_config()
        self.logger = setup_logger('topology-discovery')
        self.snmp = SNMPClient()
        
        # Network graph
        self.graph = nx.Graph()
        
        # Tracking sets
        self.discovered_devices = set()
        self.pending_devices = set()
        self.failed_devices = set()
        
        # Settings
        self.max_depth = self.config.get('discovery.max_depth', 10)
        self.max_concurrent = self.config.get('discovery.max_concurrent_devices', 10)
        
        self.logger.info("Topology Discovery Engine initialized")
    
    def discover(self, seed_ips):
        """
        Start topology discovery from seed devices
        
        Args:
            seed_ips (list): List of IP addresses to start discovery
            
        Returns:
            dict: Discovered topology
        """
        self.logger.info(f"Starting topology discovery from {len(seed_ips)} seed devices")
        
        # Add seed devices to pending queue
        self.pending_devices.update(seed_ips)
        
        depth = 0
        while self.pending_devices and depth < self.max_depth:
            depth += 1
            self.logger.info(f"Discovery depth {depth}: {len(self.pending_devices)} devices to scan")
            
            # Get devices to scan at this depth
            current_batch = list(self.pending_devices)
            self.pending_devices.clear()
            
            # Discover devices in parallel
            self._discover_batch(current_batch)
        
        self.logger.info(f"Discovery complete: {len(self.discovered_devices)} devices found")
        return self.get_topology()
    
    def _discover_batch(self, device_ips):
        """
        Discover a batch of devices in parallel
        
        Args:
            device_ips (list): List of IPs to discover
        """
        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {
                executor.submit(self._discover_device, ip): ip 
                for ip in device_ips
            }
            
            for future in as_completed(futures):
                ip = futures[future]
                try:
                    future.result()
                except Exception as e:
                    self.logger.error(f"Error discovering {ip}: {e}")
                    self.failed_devices.add(ip)
    
    def _discover_device(self, ip):
        """
        Discover a single device
        
        Args:
            ip (str): Device IP address
        """
        if ip in self.discovered_devices:
            return
        
        self.logger.info(f"Discovering device: {ip}")
        
        # Get device information
        device_info = self.snmp.get_device_info(ip)
        
        if not device_info:
            self.logger.warning(f"Device {ip} unreachable")
            self.failed_devices.add(ip)
            return
        
        # Add device to graph
        self.graph.add_node(ip, **device_info)
        self.discovered_devices.add(ip)
        
        self.logger.info(f"✅ Discovered: {device_info['hostname']} ({ip})")
        
        # Discover neighbors
        neighbors = self._discover_neighbors(ip)
        
        # Add neighbors to pending queue
        for neighbor_ip, connection_info in neighbors:
            # Add edge
            self.graph.add_edge(ip, neighbor_ip, **connection_info)
            
            # Queue neighbor for discovery if not already discovered
            if neighbor_ip not in self.discovered_devices:
                self.pending_devices.add(neighbor_ip)
    
    def _discover_neighbors(self, ip):
        """
        Discover all neighbors of a device
        
        Args:
            ip (str): Device IP
            
        Returns:
            list: List of (neighbor_ip, connection_info) tuples
        """
        neighbors = []
        
        # Try EIGRP neighbors first (for routers)
        eigrp_neighbors = self._get_eigrp_neighbors(ip)
        neighbors.extend(eigrp_neighbors)
        
        # Get routing table neighbors
        route_neighbors = self._get_routing_neighbors(ip)
        neighbors.extend(route_neighbors)
        
        # Get ARP neighbors (Layer 2)
        arp_neighbors = self._get_arp_neighbors(ip)
        neighbors.extend(arp_neighbors)

        # NEW: Get Physical Port Mappings (Bridge MIB) for Switches
        # This allows us to map specific devices to specific switch ports
        bridge_neighbors = self._get_bridge_neighbors(ip)
        neighbors.extend(bridge_neighbors)
        
        # Remove duplicates, preferring Physical/EIGRP over generic ARP
        unique_neighbors = {}
        for neighbor_ip, info in neighbors:
            if neighbor_ip not in unique_neighbors:
                unique_neighbors[neighbor_ip] = info
            else:
                # Merge info if needed, or prioritize specific types
                current_type = unique_neighbors[neighbor_ip].get('type')
                new_type = info.get('type')
                
                # Upgrade to Layer 2 Physical if available
                if new_type == 'Layer2_Physical':
                    unique_neighbors[neighbor_ip] = info
        
        self.logger.info(f"Found {len(unique_neighbors)} neighbors for {ip}")
        return list(unique_neighbors.items())

    def _get_bridge_neighbors(self, ip):
        """
        Get physical neighbors using Bridge MIB (MAC Address Table)
        Requires correlation with ARP table to resolve IPs
        """
        neighbors = []
        try:
            # 1. Get MAC Table (MAC -> Port)
            bridge_table = self.snmp.get_bridge_table(ip)
            if not bridge_table:
                return []
                
            # 2. We need to resolve MACs to IPs. 
            # In a real scenario, we'd look up a global ARP cache or query the default gateway.
            # For now, we'll check if we've seen this MAC in our discovery so far (ARP cache)
            # or try to reverse resolve.
            
            # Simple global MAC lookup (naive implementation)
            # In a full run, we would maintain a global mac_to_ip_map
            
            for entry in bridge_table:
                mac = entry['mac']
                port = entry['port']
                
                # Check if we can find an IP for this MAC from our graph or previous ARP scans
                neighbor_ip = self._find_ip_for_mac(mac)
                
                if neighbor_ip and neighbor_ip != ip:
                     neighbors.append((
                        neighbor_ip,
                        {
                            'protocol': '802.1d',
                            'type': 'Layer2_Physical',
                            'interface': f"Port {port}",
                            'discovery_method': 'bridge_mib'
                        }
                    ))
                    
        except Exception as e:
            self.logger.debug(f"Bridge discovery failed for {ip}: {e}")
            
        return neighbors

    def _find_ip_for_mac(self, target_mac):
        """Find IP address for a given MAC from discovered nodes"""
        target_mac = target_mac.lower().replace(':', '').replace('-', '')
        
        # 1. Search in discovered nodes (if we stored MACs on nodes)
        for node, data in self.graph.nodes(data=True):
            node_mac = data.get('mac', '').lower().replace(':', '').replace('-', '')
            if node_mac == target_mac:
                return node
        
        # 2. Search in ARP tables of all discovered devices
        # This is where we find IPs for devices we haven't fully discovered yet but are in neighbors
        for node in self.graph.nodes():
            # access the raw ARP data we hopefully stored or query it (optimally we store it)
            # Since we don't store ARP table in graph node attrs by default, 
            # we might rely on the fact that 'neighbors' edges might have this info if we stored it there.
            # But better: we should probably cache ARP entries during discovery.
            pass
            
        return None
    
    def _get_eigrp_neighbors(self, ip):
        """
        Get EIGRP neighbors from device
        
        Args:
            ip (str): Device IP
            
        Returns:
            list: List of (neighbor_ip, connection_info) tuples
        """
        neighbors = []
        
        try:
            # Walk EIGRP peer table
            eigrp_data = self.snmp.walk(ip, self.EIGRP_PEER_ADDR)
            
            for oid, value in eigrp_data:
                neighbor_ip = value
                
                if self._is_valid_ip(neighbor_ip):
                    neighbors.append((
                        neighbor_ip,
                        {
                            'protocol': 'EIGRP',
                            'type': 'Layer3',
                            'discovery_method': 'eigrp_peer_table'
                        }
                    ))
                    self.logger.debug(f"EIGRP neighbor found: {neighbor_ip}")
        
        except Exception as e:
            self.logger.debug(f"EIGRP discovery failed for {ip}: {e}")
        
        return neighbors
    
    def _get_routing_neighbors(self, ip):
        """
        Get neighbors from IP routing table
        
        Args:
            ip (str): Device IP
            
        Returns:
            list: List of (neighbor_ip, connection_info) tuples
        """
        neighbors = []
        
        try:
            # Get routing table next hops
            routes = self.snmp.walk(ip, self.IP_ROUTE_NEXT_HOP)
            
            for oid, next_hop in routes:
                if self._is_valid_ip(next_hop) and not self._is_local_ip(next_hop):
                    neighbors.append((
                        next_hop,
                        {
                            'protocol': 'IP Routing',
                            'type': 'Layer3',
                            'discovery_method': 'routing_table'
                        }
                    ))
        
        except Exception as e:
            self.logger.debug(f"Routing table discovery failed for {ip}: {e}")
        
        return neighbors
    
    def _get_arp_neighbors(self, ip):
        """
        Get neighbors from ARP table
        
        Args:
            ip (str): Device IP
            
        Returns:
            list: List of (neighbor_ip, connection_info) tuples
        """
        neighbors = []
        
        try:
            arp_entries = self.snmp.get_arp_table(ip)
            
            for entry in arp_entries:
                neighbor_ip = entry['ip']
                
                if self._is_valid_ip(neighbor_ip):
                    neighbors.append((
                        neighbor_ip,
                        {
                            'protocol': 'ARP',
                            'type': 'Layer2',
                            'mac': entry['mac'],
                            'discovery_method': 'arp_table'
                        }
                    ))
        
        except Exception as e:
            self.logger.debug(f"ARP discovery failed for {ip}: {e}")
        
        return neighbors
    
    def _is_valid_ip(self, ip):
        """Check if IP is valid and not special addresses"""
        try:
            parts = ip.split('.')
            if len(parts) != 4:
                return False
            
            for part in parts:
                num = int(part)
                if num < 0 or num > 255:
                    return False
            
            # Exclude special addresses
            if ip.startswith('0.') or ip.startswith('127.') or ip == '0.0.0.0':
                return False
            
            return True
        except (ValueError, TypeError):
            return False
    
    def _is_local_ip(self, ip):
        """Check if IP is a local/loopback address"""
        return ip.startswith('127.') or ip == '0.0.0.0'
    
    def get_topology(self):
        """
        Get current topology as dictionary
        
        Returns:
            dict: Topology with nodes and edges
        """
        nodes = []
        edges = []
        
        # Build nodes list
        for node_id in self.graph.nodes():
            node_data = {'id': node_id}
            node_data.update(self.graph.nodes[node_id])
            nodes.append(node_data)
        
        # Build edges list
        for source, target in self.graph.edges():
            edge_data = {
                'source': source,
                'target': target
            }
            edge_data.update(self.graph[source][target])
            edges.append(edge_data)
        
        return {
            'nodes': nodes,
            'edges': edges,
            'statistics': {
                'total_devices': len(self.discovered_devices),
                'total_connections': len(self.graph.edges()),
                'failed_devices': len(self.failed_devices),
                'discovery_time': time.time()
            }
        }
    
    def get_device_info(self, ip):
        """Get information about a specific device"""
        if ip in self.graph.nodes:
            return self.graph.nodes[ip]
        return None
    
    def get_neighbors(self, ip):
        """Get neighbors of a specific device"""
        if ip in self.graph.nodes:
            return list(self.graph.neighbors(ip))
        return []


# Test the module
if __name__ == '__main__':
    print("=" * 60)
    print("🔧 Testing Topology Discovery Engine")
    print("=" * 60)
    
    engine = TopologyDiscovery()
    
    print("\n📋 Configuration:")
    print(f"   Max Depth: {engine.max_depth}")
    print(f"   Max Concurrent: {engine.max_concurrent}")
    
    print("\n" + "=" * 60)
    print("✅ Topology Discovery Engine Ready!")
    print("=" * 60)
    print("\nℹ️  To discover topology:")
    print("   topology = engine.discover(['10.0.1.1', '10.0.2.1'])")
    print("=" * 60)