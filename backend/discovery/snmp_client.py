"""
SNMPv3 Client - Secure SNMP Communication
Production-grade implementation with error handling and retries
"""

from pysnmp.hlapi import *
from backend.core.logger import setup_logger
from backend.core.config_loader import get_config
import time

class SNMPClient:
    """
    Secure SNMPv3 client for device communication
    Implements authentication, encryption, and robust error handling
    """
    
    # Standard SNMP OIDs
    OID_SYSTEM_NAME = '1.3.6.1.2.1.1.5.0'  # sysName
    OID_SYSTEM_DESC = '1.3.6.1.2.1.1.1.0'  # sysDescr
    OID_SYSTEM_UPTIME = '1.3.6.1.2.1.1.3.0'  # sysUpTime
    OID_SYSTEM_LOCATION = '1.3.6.1.2.1.1.6.0'  # sysLocation
    OID_SYSTEM_CONTACT = '1.3.6.1.2.1.1.4.0'  # sysContact
    OID_SYSTEM_OBJECTID = '1.3.6.1.2.1.1.2.0'  # sysObjectID
    
    # Interface table OIDs
    OID_IF_TABLE = '1.3.6.1.2.1.2.2.1'
    OID_IF_DESC = '1.3.6.1.2.1.2.2.1.2'  # ifDescr
    OID_IF_TYPE = '1.3.6.1.2.1.2.2.1.3'  # ifType
    OID_IF_SPEED = '1.3.6.1.2.1.2.2.1.5'  # ifSpeed
    OID_IF_ADMIN_STATUS = '1.3.6.1.2.1.2.2.1.7'  # ifAdminStatus
    OID_IF_OPER_STATUS = '1.3.6.1.2.1.2.2.1.8'  # ifOperStatus
    
    # IP routing table
    OID_IP_ROUTE_TABLE = '1.3.6.1.2.1.4.21.1'
    
    # ARP table
    OID_ARP_TABLE = '1.3.6.1.2.1.4.22.1.2'
    
    def __init__(self):
        """Initialize SNMP client with configuration"""
        self.config = get_config()
        self.logger = setup_logger('snmp-client')
        
        # Load SNMP credentials
        self.username = self.config.get('credentials.username')
        self.auth_key = self.config.get('credentials.auth_key')
        self.priv_key = self.config.get('credentials.priv_key')
        self.timeout = self.config.get('snmp.timeout', 5)
        self.retries = self.config.get('snmp.retries', 2)
        self.port = self.config.get('snmp.port', 161)
        
        self.logger.info("SNMPv3 Client initialized")
    
    def _get_auth_protocol(self):
        """Get authentication protocol"""
        protocol = self.config.get('snmp.auth_protocol', 'SHA')
        protocols = {
            'MD5': usmHMACMD5AuthProtocol,
            'SHA': usmHMACSHAAuthProtocol,
            'SHA224': usmHMAC128SHA224AuthProtocol,
            'SHA256': usmHMAC192SHA256AuthProtocol,
            'SHA384': usmHMAC256SHA384AuthProtocol,
            'SHA512': usmHMAC384SHA512AuthProtocol
        }
        return protocols.get(protocol, usmHMACSHAAuthProtocol)
    
    def _get_priv_protocol(self):
        """Get privacy protocol"""
        protocol = self.config.get('snmp.priv_protocol', 'AES')
        protocols = {
            'DES': usmDESPrivProtocol,
            'AES': usmAesCfb128Protocol,
            'AES192': usmAesCfb192Protocol,
            'AES256': usmAesCfb256Protocol,
            '3DES': usm3DESEDEPrivProtocol
        }
        return protocols.get(protocol, usmAesCfb128Protocol)
    
    def get(self, host, oid):
        """
        Get single SNMP value
        
        Args:
            host (str): Target device IP
            oid (str): SNMP OID to query
            
        Returns:
            str: SNMP value or None if error
        """
        try:
            self.logger.debug(f"GET {host} - OID: {oid}")
            
            iterator = getCmd(
                SnmpEngine(),
                UsmUserData(
                    self.username,
                    self.auth_key,
                    self.priv_key,
                    authProtocol=self._get_auth_protocol(),
                    privProtocol=self._get_priv_protocol()
                ),
                UdpTransportTarget((host, self.port), timeout=self.timeout, retries=self.retries),
                ContextData(),
                ObjectType(ObjectIdentity(oid))
            )
            
            errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
            
            if errorIndication:
                self.logger.error(f"SNMP Error [{host}]: {errorIndication}")
                return None
            
            if errorStatus:
                self.logger.error(f"SNMP Status Error [{host}]: {errorStatus.prettyPrint()}")
                return None
            
            for varBind in varBinds:
                return str(varBind[1])
            
            return None
            
        except Exception as e:
            self.logger.error(f"Exception during SNMP GET [{host}]: {e}")
            return None
    
    def walk(self, host, oid):
        """
        Walk SNMP table
        
        Args:
            host (str): Target device IP
            oid (str): Base OID to walk
            
        Returns:
            list: List of tuples (OID, value)
        """
        results = []
        
        try:
            self.logger.debug(f"WALK {host} - OID: {oid}")
            
            for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
                SnmpEngine(),
                UsmUserData(
                    self.username,
                    self.auth_key,
                    self.priv_key,
                    authProtocol=self._get_auth_protocol(),
                    privProtocol=self._get_priv_protocol()
                ),
                UdpTransportTarget((host, self.port), timeout=self.timeout),
                ContextData(),
                ObjectType(ObjectIdentity(oid)),
                lexicographicMode=False
            ):
                if errorIndication:
                    self.logger.error(f"SNMP Walk Error [{host}]: {errorIndication}")
                    break
                
                if errorStatus:
                    self.logger.error(f"SNMP Walk Status Error [{host}]: {errorStatus.prettyPrint()}")
                    break
                
                for varBind in varBinds:
                    results.append((str(varBind[0]), str(varBind[1])))
            
            self.logger.debug(f"Retrieved {len(results)} entries from {host}")
            return results
            
        except Exception as e:
            self.logger.error(f"Exception during SNMP WALK [{host}]: {e}")
            return []
    
    def get_device_info(self, host):
        """
        Get comprehensive device information
        
        Args:
            host (str): Target device IP
            
        Returns:
            dict: Device information or None if unreachable
        """
        self.logger.info(f"Collecting device info from {host}")
        
        # Try to get sysName first (quick check if device is reachable)
        sys_name = self.get(host, self.OID_SYSTEM_NAME)
        if not sys_name:
            self.logger.warning(f"Device {host} is unreachable or not responding to SNMP")
            return None
        
        device_info = {
            'ip': host,
            'hostname': sys_name,
            'description': self.get(host, self.OID_SYSTEM_DESC) or 'Unknown',
            'uptime': self.get(host, self.OID_SYSTEM_UPTIME) or '0',
            'location': self.get(host, self.OID_SYSTEM_LOCATION) or 'Unknown',
            'contact': self.get(host, self.OID_SYSTEM_CONTACT) or 'Unknown',
            'system_oid': self.get(host, self.OID_SYSTEM_OBJECTID) or 'Unknown',
            'mac': self._get_device_mac(host),
            'discovered_at': time.time()
        }
        
        # Determine device type from sysObjectID or description
        device_info['type'] = self._determine_device_type(device_info)
        
        self.logger.info(f"✅ Device info collected: {device_info['hostname']} ({device_info['type']})")
        return device_info
    
    def _determine_device_type(self, device_info):
        """
        Determine device type from SNMP data
        
        Args:
            device_info (dict): Device information
            
        Returns:
            str: Device type (router, switch, firewall, etc.)
        """
        desc = device_info.get('description', '').lower()
        sys_oid = device_info.get('system_oid', '')
        
        # Cisco devices
        if 'cisco' in desc:
            if 'router' in desc or '1841' in desc or '2800' in desc:
                return 'router'
            elif 'switch' in desc or 'catalyst' in desc:
                return 'switch'
            elif 'asa' in desc or 'firewall' in desc:
                return 'firewall'
        
        # Generic detection
        if 'router' in desc:
            return 'router'
        elif 'switch' in desc or 'layer 2' in desc:
            return 'switch'
        elif 'firewall' in desc:
            return 'firewall'
        elif 'server' in desc:
            return 'server'
        
        return 'unknown'

    def _get_device_mac(self, host):
        """Try to get the device's MAC address (from Interface 1 or similar)"""
        try:
            # OID for ifPhysAddress
            OID_IF_PHYS_ADDRESS = '1.3.6.1.2.1.2.2.1.6'
            
            # Walk interfaces and return the first valid MAC
            interfaces = self.walk(host, OID_IF_PHYS_ADDRESS)
            
            for oid, val in interfaces:
                if len(val) > 0:
                     # Convert to hex if needed (pysnmp might return raw bytes or specialized type)
                     # Assuming string representation for now or handling basics
                     # For simplicity in this demo, we'll assume the string is usable or empty
                     if len(str(val)) > 4: # reasonably long string
                         return str(val)
                         
            return '00:00:00:00:00:00'
        except Exception:
            return '00:00:00:00:00:00'
    
    def get_interfaces(self, host):
        """
        Get all network interfaces
        
        Args:
            host (str): Target device IP
            
        Returns:
            list: List of interface dictionaries
        """
        self.logger.info(f"Collecting interfaces from {host}")
        
        interfaces = []
        if_desc_list = self.walk(host, self.OID_IF_DESC)
        
        for oid, desc in if_desc_list:
            # Extract interface index from OID
            if_index = oid.split('.')[-1]
            
            interface = {
                'index': if_index,
                'description': desc,
                'type': self.get(host, f"{self.OID_IF_TYPE}.{if_index}"),
                'speed': self.get(host, f"{self.OID_IF_SPEED}.{if_index}"),
                'admin_status': self.get(host, f"{self.OID_IF_ADMIN_STATUS}.{if_index}"),
                'oper_status': self.get(host, f"{self.OID_IF_OPER_STATUS}.{if_index}")
            }
            
            interfaces.append(interface)
        
        self.logger.info(f"Found {len(interfaces)} interfaces on {host}")
        return interfaces
    
    def get_arp_table(self, host):
        """
        Get ARP table entries
        
        Args:
            host (str): Target device IP
            
        Returns:
            list: List of ARP entries
        """
        self.logger.info(f"Collecting ARP table from {host}")
        
        arp_entries = []
        arp_data = self.walk(host, self.OID_ARP_TABLE)
        
        for oid, mac in arp_data:
            # Extract IP from OID (last 4 octets)
            ip_parts = oid.split('.')[-4:]
            ip = '.'.join(ip_parts)
            
            # Format MAC address
            if len(mac) > 12: # Handle raw bytes
                 # Convert raw bytes to hex string if needed, pysnmp usually returns PrettyPrint
                 pass

            arp_entries.append({
                'ip': ip,
                'mac': mac,
                'source_device': host
            })
        
        self.logger.info(f"Found {len(arp_entries)} ARP entries on {host}")
        return arp_entries

    def get_bridge_table(self, host):
        """
        Get Bridge MIB (MAC Address Table)
        
        Args:
            host (str): Target device IP
            
        Returns:
            list: List of {mac, port, ifIndex}
        """
        self.logger.info(f"Collecting Bridge Table from {host}")
        
        # OIDs for Bridge MIB
        OID_DOT1D_TP_FDB_PORT = '1.3.6.1.2.1.17.4.3.1.2'
        OID_DOT1D_BASE_PORT_IFINDEX = '1.3.6.1.2.1.17.1.4.1.2'
        
        mac_table = []
        
        try:
            # Get MAC -> Bridge Port
            fdb_ports = self.walk(host, OID_DOT1D_TP_FDB_PORT)
            
            # Get Bridge Port -> ifIndex map
            base_ports = self.walk(host, OID_DOT1D_BASE_PORT_IFINDEX)
            port_map = {} # BridgePort -> ifIndex
            
            for oid, if_index in base_ports:
                bridge_port = oid.split('.')[-1]
                port_map[bridge_port] = if_index
            
            for oid, bridge_port in fdb_ports:
                # Extract decimal MAC from OID
                # OID is .1.3.6.1.2.1.17.4.3.1.2.a.b.c.d.e.f
                mac_dec = oid.split('.')[-6:]
                mac_hex = ':'.join([f"{int(x):02X}" for x in mac_dec])
                
                if_index = port_map.get(bridge_port)
                
                if if_index:
                    mac_table.append({
                        'mac': mac_hex,
                        'port': bridge_port,
                        'ifIndex': if_index
                    })
                    
            self.logger.info(f"Found {len(mac_table)} MAC entries on {host}")
            return mac_table
            
        except Exception as e:
            self.logger.error(f"Error fetching Bridge Table from {host}: {e}")
            return []
    
    def test_connectivity(self, host):
        """
        Test if device is reachable via SNMP
        
        Args:
            host (str): Target device IP
            
        Returns:
            bool: True if reachable, False otherwise
        """
        result = self.get(host, self.OID_SYSTEM_NAME)
        return result is not None


# Module-level test
if __name__ == '__main__':
    print("=" * 60)
    print("🔧 Testing SNMP Client")
    print("=" * 60)
    
    client = SNMPClient()
    
    print("\n📋 Configuration:")
    print(f"   Username: {client.username}")
    print(f"   Timeout: {client.timeout}s")
    print(f"   Retries: {client.retries}")
    
    print("\n" + "=" * 60)
    print("✅ SNMP Client Module Ready!")
    print("=" * 60)
    print("\nℹ️  To test with real devices:")
    print("   1. Configure SNMPv3 on a network device")
    print("   2. Update credentials in config.yaml")
    print("   3. Run: client.get_device_info('device_ip')")
    print("=" * 60)