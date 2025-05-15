import os
from pathlib import Path
from dotenv import load_dotenv

# load .env if present
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

class Settings:  # pylint: disable=too-few-public-methods
    NR_ACCOUNT   = os.getenv("NR_ACCOUNT_ID", "0")
    NR_API_KEY   = os.getenv("NR_API_KEY",    "")
    OPENAI_KEY   = os.getenv("OPENAI_API_KEY", "")
    LOG_SAMPLE   = int(os.getenv("LOG_SAMPLE", 200))     # for LLM probe
    GRAPH_BACKEND= os.getenv("GRAPH_BACKEND", "networkx") # or "neo4j"
    OUTPUT_DIR   = Path(os.getenv("OUTPUT_DIR", "output")).resolve()

settings = Settings()
settings.OUTPUT_DIR.mkdir(exist_ok=True)
