"""
Test configuration and logging
"""

import sys
import io

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from backend.core.config_loader import get_config
from backend.core.logger import setup_logger

print("=" * 60)
print("Testing Configuration System")
print("=" * 60)

# Test config loading
config = get_config()
print(f"\n[OK] App Name: {config.get('app.name')}")
print(f"[OK] Version: {config.get('app.version')}")
print(f"[OK] SNMP Port: {config.get('snmp.port')}")
print(f"[OK] API Port: {config.get('api.port')}")

# Test logger
logger = setup_logger()
logger.info("Logger initialized successfully!")
logger.debug("This is a debug message")
logger.warning("This is a warning")

print("\n" + "=" * 60)
print("SUCCESS: Configuration and Logging Systems Working!")
print("=" * 60)