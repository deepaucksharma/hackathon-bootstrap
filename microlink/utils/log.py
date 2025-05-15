import logging
import sys

def get_logger(name: str = "microlink") -> logging.Logger:
    """Return colourised console logger."""
    log = logging.getLogger(name)
    if log.handlers:      # already configured
        return log
    log.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    # Use a simpler formatter without emojis for Windows compatibility
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    handler.setFormatter(formatter)
    log.addHandler(handler)
    return log
