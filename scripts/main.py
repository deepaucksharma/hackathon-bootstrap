import argparse
import sys
from pathlib import Path
from microlink.pipeline import demo
from microlink.utils.log import get_logger

log = get_logger()

def main():
    """Main entry point for the MicroLink CLI."""
    parser = argparse.ArgumentParser(description="MicroLink - Microservice Observability Toolkit")
    
    # Add subparsers for different commands
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Demo command
    demo_parser = subparsers.add_parser("demo", help="Run end-to-end demo")
    demo_parser.add_argument("--order-id", default="orderId=124", 
                          help="Correlation ID to visualize (default: orderId=124)")
    
    # Visualize command
    viz_parser = subparsers.add_parser("viz", help="Visualize existing graph")
    viz_parser.add_argument("id", help="Correlation ID to visualize")
    
    # Anomalies command
    subparsers.add_parser("anomalies", help="Show anomaly report")
    
    # Parse arguments
    args = parser.parse_args()
    
    # If no command is provided, show help
    if not args.command:
        parser.print_help()
        return
    
    # Execute the appropriate command
    if args.command == "demo":
        log.info("MicroLink demo starting...")
        results = demo(args.order_id)
        log.info("Done!")
    
    elif args.command == "viz":
        # Check if graph pickle exists
        graph_path = Path("output/G.pkl")
        if not graph_path.exists():
            log.error("Graph file not found. Run 'demo' command first.")
            sys.exit(1)
        
        # Load graph and visualize
        import pickle
        from scripts import visualize_flow
        
        log.info("Loading graph and generating visualization...")
        with open(graph_path, "rb") as f:
            graph = pickle.load(f)
        
        html_path = visualize_flow.lineage_html(graph, args.id)
        log.info("Visualization created: %s", html_path)
    
    elif args.command == "anomalies":
        # Check if graph pickle exists
        graph_path = Path("output/G.pkl")
        if not graph_path.exists():
            log.error("Graph file not found. Run 'demo' command first.")
            sys.exit(1)
        
        # Load graph and generate anomaly report
        import pickle
        from scripts import detect_anomalies
        
        log.info("Loading graph and analyzing anomalies...")
        with open(graph_path, "rb") as f:
            graph = pickle.load(f)
        
        report_path = detect_anomalies.main(graph)
        log.info("Anomaly report created: %s", report_path)

if __name__ == "__main__":
    main()
