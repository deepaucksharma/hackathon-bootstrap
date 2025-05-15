from pathlib import Path
import pandas as pd
from microlink.utils import nrdb, log
from microlink import config
LOGGER = log.get_logger(__name__)

def main(demo: bool = False) -> Path:
    if demo:
        df = nrdb.nrdb_query("demo", config.settings.NR_ACCOUNT, config.settings.NR_API_KEY)
    else:
        raise NotImplementedError("Real NRDB export coming in Turn 2")
    out = Path("output/raw_logs.csv")
    df.to_csv(out, index=False)
    LOGGER.info("wrote %s", out)
    return out
