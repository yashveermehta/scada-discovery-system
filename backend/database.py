import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'scada_topology.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT,
            ip TEXT,
            mac TEXT,
            type TEXT,
            os TEXT,
            uptime TEXT,
            status TEXT,
            last_seen TIMESTAMP,
            is_authorized BOOLEAN DEFAULT 0
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS links (
            source TEXT,
            target TEXT,
            type TEXT,
            bandwidth TEXT,
            protocol TEXT,
            last_seen TIMESTAMP,
            PRIMARY KEY (source, target)
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            timestamp TIMESTAMP,
            severity TEXT,
            message TEXT,
            device_id TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')

    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")

def save_device(device):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO devices (id, name, ip, mac, type, os, uptime, status, last_seen, is_authorized)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT is_authorized FROM devices WHERE id = ?), 0))
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            ip=excluded.ip,
            type=excluded.type,
            os=excluded.os,
            uptime=excluded.uptime,
            status=excluded.status,
            last_seen=excluded.last_seen
    ''', (
        device['id'], device['name'], device['ip'], device.get('mac', '00:00:00:00:00:00'), 
        device['type'], device.get('os', 'Unknown'), device.get('uptime', 'N/A'), 
        device.get('status', 'online'), datetime.now().isoformat(), 
        device['id']
    ))
    conn.commit()
    conn.close()

def save_link(link):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT OR REPLACE INTO links (source, target, type, bandwidth, protocol, last_seen)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        link['source'], link['target'], link.get('type', 'logical'), 
        link.get('bandwidth', 'Unknown'), link.get('protocol', 'EIGRP'), datetime.now().isoformat()
    ))
    conn.commit()
    conn.close()

def get_topology():
    conn = get_db_connection()
    nodes = [dict(row) for row in conn.execute('SELECT * FROM devices').fetchall()]
    links = [dict(row) for row in conn.execute('SELECT * FROM links').fetchall()]
    conn.close()
    
    for node in nodes:
        node['isAuthorized'] = bool(node['is_authorized'])
        node['eigrpNeighbors'] = []
        
    # FIX: Always return statistics so frontend never crashes on missing key
    return {
        'nodes': nodes,
        'links': links,
        'statistics': {
            'total_devices': len(nodes),
            'total_connections': len(links),
            'failed_devices': 0
        }
    }

def authorize_device(device_id):
    conn = get_db_connection()
    conn.execute('UPDATE devices SET is_authorized = 1 WHERE id = ?', (device_id,))
    conn.commit()
    conn.close()

def approve_all_baseline():
    conn = get_db_connection()
    conn.execute('UPDATE devices SET is_authorized = 1')
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
