"""
REST API for SCADA Topology Discovery System
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.discovery.topology_discovery import TopologyDiscovery
from backend.core.logger import setup_logger
from backend.core.config_loader import get_config
from backend.database import (init_db, get_topology as get_db_topology,
                               save_device, save_link, authorize_device, approve_all_baseline)

app = Flask(__name__,
            static_folder='../../frontend/static',
            static_url_path='')
CORS(app)

config = get_config()
logger = setup_logger('api')
discovery_engine = None

init_db()

discovery_status = {
    'running': False,
    'progress': 0,
    'message': 'Ready',
    'last_run': None
}

@app.route('/')
def home():
    try:
        return send_from_directory(app.static_folder, 'index.html')
    except OSError:
        return jsonify({'message': 'SCADA Topology Discovery API', 'version': '1.0.0', 'status': 'running'})

@app.route('/api/info')
def api_info():
    return jsonify({
        'name': config.get('app.name'),
        'version': config.get('app.version'),
        'environment': config.get('app.environment'),
        'status': 'running'
    })

@app.route('/api/config')
def get_config_info():
    return jsonify({
        'snmp': {
            'version': config.get('snmp.version'),
            'timeout': config.get('snmp.timeout'),
            'retries': config.get('snmp.retries')
        },
        'discovery': {
            'max_depth': config.get('discovery.max_depth'),
            'max_concurrent': config.get('discovery.max_concurrent_devices'),
            'interval': config.get('discovery.interval')
        },
        'seed_devices': config.get('seed_devices')
    })

@app.route('/api/topology')
def get_topology():
    """Get current network topology from database"""
    topology = get_db_topology()
    return jsonify(topology)  # FIX: db now always returns statistics inside

@app.route('/api/discover', methods=['POST'])
def start_discovery():
    global discovery_engine, discovery_status

    if discovery_status['running']:
        return jsonify({'error': 'Discovery already running', 'status': discovery_status}), 400

    try:
        data = request.get_json() or {}
        seed_ips = data.get('seed_devices')

        if not seed_ips:
            seed_devices = config.get('seed_devices', [])
            seed_ips = [device['ip'] for device in seed_devices]

        if not seed_ips:
            return jsonify({
                'error': 'No seed devices provided',
                'message': 'Provide seed_devices in request body or configure in config.yaml'
            }), 400

        logger.info(f"Starting discovery with seeds: {seed_ips}")
        discovery_status['running'] = True
        discovery_status['message'] = 'Discovery in progress...'
        discovery_status['progress'] = 0

        discovery_engine = TopologyDiscovery()
        topology = discovery_engine.discover(seed_ips)

        for node in topology.get('nodes', []):
            save_device(node)

        for edge in topology.get('edges', []):
            save_link({
                'source': edge['source'],
                'target': edge['target'],
                'type': edge.get('type', 'logical'),
                'bandwidth': edge.get('bandwidth', 'Unknown'),
                'protocol': edge.get('protocol', 'EIGRP')
            })

        discovery_status['running'] = False
        discovery_status['progress'] = 100
        discovery_status['message'] = 'Discovery completed'
        discovery_status['last_run'] = time.time()

        return jsonify({
            'status': 'success',
            'topology': get_db_topology(),
            'discovery_info': discovery_status
        })

    except Exception as e:
        logger.error(f"Discovery failed: {e}")
        discovery_status['running'] = False
        discovery_status['message'] = f'Error: {str(e)}'
        return jsonify({'error': 'Discovery failed', 'message': str(e)}), 500

@app.route('/api/status')
def get_status():
    return jsonify(discovery_status)

@app.route('/api/approve', methods=['POST'])
def approve_topology():
    try:
        approve_all_baseline()
        return jsonify({'status': 'success', 'message': 'All current devices approved as baseline'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/authorize/<device_id>', methods=['POST'])
def authorize_node(device_id):
    try:
        authorize_device(device_id)
        return jsonify({'status': 'success', 'message': f'Device {device_id} authorized'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/demo', methods=['POST'])
def create_demo_topology():
    """Create a realistic GAIL pipeline SCADA demo topology"""
    logger.info("Creating demo topology")

    # FIX: expanded and realistic demo data
    demo_nodes = [
        {'id': '10.0.0.1',  'name': 'GAIL-HQ-CoreRTR',    'ip': '10.0.0.1',  'mac': '00:1A:2B:3C:4D:01', 'type': 'router',   'os': 'Cisco IOS-XE 17.3',  'uptime': '187d 4h',   'status': 'online', 'is_authorized': 1},
        {'id': '10.0.1.1',  'name': 'GAIL-PIPE-N-RTR',    'ip': '10.0.1.1',  'mac': '00:1A:2B:3C:4D:02', 'type': 'router',   'os': 'Cisco ISR 4451',      'uptime': '94d 7h',    'status': 'online', 'is_authorized': 1},
        {'id': '10.0.2.1',  'name': 'GAIL-PIPE-S-RTR',    'ip': '10.0.2.1',  'mac': '00:1A:2B:3C:4D:03', 'type': 'router',   'os': 'Cisco ISR 4331',      'uptime': '102d 2h',   'status': 'online', 'is_authorized': 1},
        {'id': '10.0.3.1',  'name': 'GAIL-PIPE-W-RTR',    'ip': '10.0.3.1',  'mac': '00:1A:2B:3C:4D:04', 'type': 'router',   'os': 'Cisco ASR 1001-X',    'uptime': '210d 9h',   'status': 'online', 'is_authorized': 1},
        {'id': '10.0.1.10', 'name': 'GAIL-N-SWITCH',      'ip': '10.0.1.10', 'mac': '00:1A:2B:3C:4D:10', 'type': 'switch',   'os': 'Cisco NX-OS 9.3',     'uptime': '94d 1h',    'status': 'online', 'is_authorized': 1},
        {'id': '10.0.2.10', 'name': 'GAIL-S-SWITCH',      'ip': '10.0.2.10', 'mac': '00:1A:2B:3C:4D:11', 'type': 'switch',   'os': 'Cisco IOS 15.2',      'uptime': '88d 12h',   'status': 'online', 'is_authorized': 1},
        {'id': '10.0.3.10', 'name': 'GAIL-W-FIREWALL',    'ip': '10.0.3.10', 'mac': '00:1A:2B:3C:4D:12', 'type': 'firewall', 'os': 'Cisco FTD 7.2',       'uptime': '68d 5h',    'status': 'online', 'is_authorized': 1},
        {'id': '10.0.1.20', 'name': 'SCADA-RTU-NORTH-01', 'ip': '10.0.1.20', 'mac': '00:1A:2B:3C:4D:20', 'type': 'server',   'os': 'Embedded Linux 5.4',  'uptime': '94d',       'status': 'online', 'is_authorized': 1},
        {'id': '10.0.2.20', 'name': 'SCADA-RTU-SOUTH-01', 'ip': '10.0.2.20', 'mac': '00:1A:2B:3C:4D:21', 'type': 'server',   'os': 'Embedded Linux 5.4',  'uptime': '88d',       'status': 'online', 'is_authorized': 1},
        {'id': '10.0.3.20', 'name': 'SCADA-HIST-WEST-01', 'ip': '10.0.3.20', 'mac': '00:1A:2B:3C:4D:22', 'type': 'server',   'os': 'Red Hat Enterprise 8','uptime': '68d 2h',    'status': 'online', 'is_authorized': 1},
    ]

    demo_links = [
        {'source': '10.0.0.1',  'target': '10.0.1.1',  'type': 'logical',  'bandwidth': '1Gbps',  'protocol': 'EIGRP'},
        {'source': '10.0.0.1',  'target': '10.0.2.1',  'type': 'logical',  'bandwidth': '1Gbps',  'protocol': 'EIGRP'},
        {'source': '10.0.0.1',  'target': '10.0.3.1',  'type': 'logical',  'bandwidth': '10Gbps', 'protocol': 'EIGRP'},
        {'source': '10.0.1.1',  'target': '10.0.1.10', 'type': 'physical', 'bandwidth': '10Gbps', 'protocol': 'Layer2'},
        {'source': '10.0.2.1',  'target': '10.0.2.10', 'type': 'physical', 'bandwidth': '1Gbps',  'protocol': 'Layer2'},
        {'source': '10.0.3.1',  'target': '10.0.3.10', 'type': 'physical', 'bandwidth': '10Gbps', 'protocol': 'Layer2'},
        {'source': '10.0.1.10', 'target': '10.0.1.20', 'type': 'physical', 'bandwidth': '1Gbps',  'protocol': 'ARP/MAC'},
        {'source': '10.0.2.10', 'target': '10.0.2.20', 'type': 'physical', 'bandwidth': '1Gbps',  'protocol': 'ARP/MAC'},
        {'source': '10.0.3.10', 'target': '10.0.3.20', 'type': 'physical', 'bandwidth': '1Gbps',  'protocol': 'ARP/MAC'},
    ]

    for node in demo_nodes:
        save_device(node)
    for link in demo_links:
        save_link(link)

    return jsonify({
        'status': 'success',
        'message': 'Demo topology loaded',
        'topology': get_db_topology()
    })

if __name__ == '__main__':
    app.run(
        host=config.get('api.host', '0.0.0.0'),
        port=config.get('api.port', 5000),
        debug=config.get('app.debug', True)
    )