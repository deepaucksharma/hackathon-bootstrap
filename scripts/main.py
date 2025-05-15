import argparse
from microlink.pipeline import demo
from microlink.utils.log import get_logger

log = get_logger()

parser = argparse.ArgumentParser(description="MicroLink demo driver")
parser.add_argument("--demo", action="store_true", help="Run end-to-end demo")
args = parser.parse_args()

if args.demo:
    log.info("MicroLink demo starting...")
    demo()
    log.info("Done!")
else:
    parser.print_help()
