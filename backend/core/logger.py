"""
Logging configuration
"""

import logging
import logging.handlers
from pathlib import Path
from .config_loader import get_config

def setup_logger(name='scada-discovery'):
    """Setup logger with file and console handlers"""
    
    config = get_config()
    log_level = config.get('logging.level', 'INFO')
    log_file = config.get('logging.file', 'logs/discovery.log')
    
    # Create logs directory
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, log_level))
    
    # Avoid duplicate handlers
    if logger.handlers:
        return logger
    
    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=config.get('logging.max_size_mb', 100) * 1024 * 1024,
        backupCount=config.get('logging.backup_count', 5)
    )
    
    # Console handler
    console_handler = logging.StreamHandler()
    
    # Formatter
    log_format = config.get('logging.format', 
                           '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    formatter = logging.Formatter(log_format)
    
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger