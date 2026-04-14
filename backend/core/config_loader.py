"""
Configuration loader with validation
"""

import yaml
import os
from pathlib import Path

# Resolve config path relative to this file so it works from any CWD
_DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / 'config' / 'config.yaml'

class ConfigLoader:
    """Load and validate configuration"""
    
    def __init__(self, config_path=None):
        self.config_path = str(config_path) if config_path is not None else str(_DEFAULT_CONFIG_PATH)
        self.config = None
        self.load()
    
    def load(self):
        """Load configuration from YAML file"""
        try:
            with open(self.config_path, 'r') as f:
                self.config = yaml.safe_load(f)
            print(f"✅ Configuration loaded from {self.config_path}")
            self.validate()
            return self.config
        except FileNotFoundError:
            print(f"❌ Configuration file not found: {self.config_path}")
            raise
        except yaml.YAMLError as e:
            print(f"❌ Error parsing YAML: {e}")
            raise
    
    def validate(self):
        """Validate required configuration keys"""
        required_keys = ['app', 'snmp', 'discovery', 'api']
        
        for key in required_keys:
            if key not in self.config:
                raise ValueError(f"Missing required configuration section: {key}")
        
        print("✅ Configuration validated")
    
    def get(self, key, default=None):
        """Get configuration value with dot notation"""
        keys = key.split('.')
        value = self.config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value
    
    def get_snmp_config(self):
        """Get SNMP configuration as dict"""
        return {
            'username': self.get('credentials.username'),
            'auth_key': self.get('credentials.auth_key'),
            'priv_key': self.get('credentials.priv_key'),
            'auth_protocol': self.get('snmp.auth_protocol'),
            'priv_protocol': self.get('snmp.priv_protocol'),
            'timeout': self.get('snmp.timeout', 5),
            'retries': self.get('snmp.retries', 2)
        }

# Global config instance
_config = None

def get_config():
    """Get global configuration instance"""
    global _config
    if _config is None:
        _config = ConfigLoader()
    return _config