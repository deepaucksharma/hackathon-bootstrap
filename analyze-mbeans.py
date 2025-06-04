#!/usr/bin/env python3
"""
MBean Analysis Script for NRI-Kafka Debugging
This script helps identify mismatches between expected and actual Kafka MBeans
"""

import json
import re
import subprocess
import sys

# Expected MBean patterns from nri-kafka source code
EXPECTED_BROKER_MBEANS = [
    # From broker_definitions.go
    "kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec",
    "kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec",
    "kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec",
    "kafka.server:type=BrokerTopicMetrics,name=TotalFetchRequestsPerSec",
    "kafka.server:type=BrokerTopicMetrics,name=TotalProduceRequestsPerSec",
    "kafka.server:type=BrokerTopicMetrics,name=FailedFetchRequestsPerSec",
    "kafka.server:type=BrokerTopicMetrics,name=FailedProduceRequestsPerSec",
    "kafka.server:type=BrokerTopicMetrics,name=ReplicationBytesInPerSec",
    "kafka.server:type=BrokerTopicMetrics,name=ReplicationBytesOutPerSec",
    "kafka.server:type=ReplicaManager,name=IsrExpandsPerSec",
    "kafka.server:type=ReplicaManager,name=IsrShrinksPerSec",
    "kafka.server:type=ReplicaManager,name=LeaderCount",
    "kafka.server:type=ReplicaManager,name=PartitionCount",
    "kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions",
    "kafka.controller:type=KafkaController,name=ActiveControllerCount",
    "kafka.controller:type=KafkaController,name=OfflinePartitionsCount",
    "kafka.server:type=KafkaRequestHandlerPool,name=RequestHandlerAvgIdlePercent",
    "kafka.log:type=LogFlushStats,name=LogFlushRateAndTimeMs",
    "kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent",
]

# Network request metrics pattern
REQUEST_METRICS_PATTERN = r"kafka\.network:type=RequestMetrics,name=(\w+),request=(\w+)"

def run_nrjmx_command(command, host="localhost", port="9999", user=None, password=None):
    """Run an nrjmx command and return output"""
    cmd = ["nrjmx", "-hostname", host, "-port", str(port)]
    
    if user:
        cmd.extend(["-username", user])
    if password:
        cmd.extend(["-password", password])
    
    try:
        process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, 
                                 stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate(input=command)
        
        if process.returncode != 0:
            print(f"Error running nrjmx: {stderr}")
            return None
            
        return stdout
    except FileNotFoundError:
        print("Error: nrjmx not found. Please ensure it's in your PATH")
        return None
    except Exception as e:
        print(f"Error running nrjmx: {e}")
        return None

def get_all_mbeans(host="localhost", port="9999", user=None, password=None):
    """Get list of all MBeans from JMX"""
    output = run_nrjmx_command("list", host, port, user, password)
    if not output:
        return []
    
    mbeans = []
    for line in output.strip().split('\n'):
        if line and not line.startswith('#'):
            mbeans.append(line.strip())
    
    return mbeans

def analyze_broker_mbeans(actual_mbeans):
    """Analyze broker MBeans - what's expected vs what's available"""
    print("\n=== Broker MBean Analysis ===")
    
    found = []
    missing = []
    
    for expected in EXPECTED_BROKER_MBEANS:
        if expected in actual_mbeans:
            found.append(expected)
        else:
            # Check for partial matches
            partial_matches = [mb for mb in actual_mbeans if expected.split(',')[0] in mb]
            if partial_matches:
                print(f"⚠️  Expected: {expected}")
                print(f"   Found similar: {partial_matches[0]}")
            else:
                missing.append(expected)
    
    print(f"\n✅ Found {len(found)}/{len(EXPECTED_BROKER_MBEANS)} expected broker MBeans")
    
    if missing:
        print(f"\n❌ Missing {len(missing)} MBeans:")
        for mb in missing:
            print(f"   - {mb}")
    
    return found, missing

def analyze_request_metrics(actual_mbeans):
    """Analyze network request metrics"""
    print("\n=== Request Metrics Analysis ===")
    
    request_mbeans = [mb for mb in actual_mbeans if "RequestMetrics" in mb]
    print(f"Found {len(request_mbeans)} request metric MBeans")
    
    # Group by request type
    requests_by_type = {}
    for mb in request_mbeans:
        match = re.search(REQUEST_METRICS_PATTERN, mb)
        if match:
            metric_name = match.group(1)
            request_type = match.group(2)
            
            if request_type not in requests_by_type:
                requests_by_type[request_type] = []
            requests_by_type[request_type].append(metric_name)
    
    if requests_by_type:
        print("\nRequest types found:")
        for req_type, metrics in sorted(requests_by_type.items()):
            print(f"  - {req_type}: {len(metrics)} metrics")

def analyze_topic_mbeans(actual_mbeans):
    """Analyze topic-related MBeans"""
    print("\n=== Topic MBean Analysis ===")
    
    topic_mbeans = [mb for mb in actual_mbeans if ",topic=" in mb]
    print(f"Found {len(topic_mbeans)} topic-specific MBeans")
    
    # Extract unique topics
    topics = set()
    for mb in topic_mbeans:
        match = re.search(r'topic=([^,\s]+)', mb)
        if match:
            topics.add(match.group(1))
    
    if topics:
        print(f"\nTopics found: {len(topics)}")
        for topic in sorted(topics)[:5]:  # Show first 5
            print(f"  - {topic}")
        if len(topics) > 5:
            print(f"  ... and {len(topics) - 5} more")

def suggest_fixes(missing_mbeans, actual_mbeans):
    """Suggest configuration fixes based on analysis"""
    print("\n=== Suggested Fixes ===")
    
    # Check for version-specific patterns
    if any("kafka.server:type=kafka-metrics-count" in mb for mb in actual_mbeans):
        print("✓ Detected newer Kafka version metrics")
        print("  → Try setting KAFKA_VERSION to 2.8.0 or 3.0.0")
    
    # Check if controller metrics are missing
    controller_missing = any("kafka.controller" in mb for mb in missing_mbeans)
    if controller_missing and not any("kafka.controller" in mb for mb in actual_mbeans):
        print("⚠️  No controller metrics found")
        print("  → This broker might not be the active controller")
        print("  → This is normal if you have multiple brokers")
    
    # Check for authentication issues
    if len(actual_mbeans) < 100:
        print("⚠️  Very few MBeans found")
        print("  → Check JMX authentication settings")
        print("  → Verify JMX is fully enabled on the broker")

def main():
    print("=== NRI-Kafka MBean Analysis Tool ===")
    print("This tool compares expected vs actual Kafka MBeans\n")
    
    # Parse command line arguments
    host = "localhost"
    port = "9999"
    user = None
    password = None
    
    # Simple argument parsing
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--host" and i + 1 < len(args):
            host = args[i + 1]
            i += 2
        elif args[i] == "--port" and i + 1 < len(args):
            port = args[i + 1]
            i += 2
        elif args[i] == "--user" and i + 1 < len(args):
            user = args[i + 1]
            i += 2
        elif args[i] == "--password" and i + 1 < len(args):
            password = args[i + 1]
            i += 2
        else:
            print(f"Unknown argument: {args[i]}")
            print("Usage: analyze-mbeans.py [--host HOST] [--port PORT] [--user USER] [--password PASSWORD]")
            sys.exit(1)
    
    print(f"Connecting to JMX at {host}:{port}")
    if user:
        print(f"Using authentication with user: {user}")
    
    # Get all MBeans
    print("\nFetching MBean list...")
    actual_mbeans = get_all_mbeans(host, port, user, password)
    
    if not actual_mbeans:
        print("❌ Failed to retrieve MBeans")
        sys.exit(1)
    
    print(f"✓ Found {len(actual_mbeans)} total MBeans")
    
    # Filter Kafka-specific MBeans
    kafka_mbeans = [mb for mb in actual_mbeans if mb.startswith("kafka.")]
    print(f"✓ Found {len(kafka_mbeans)} Kafka-specific MBeans")
    
    # Analyze different categories
    found, missing = analyze_broker_mbeans(kafka_mbeans)
    analyze_request_metrics(kafka_mbeans)
    analyze_topic_mbeans(kafka_mbeans)
    
    # Provide suggestions
    suggest_fixes(missing, kafka_mbeans)
    
    # Save detailed output
    output_file = "mbean-analysis.json"
    analysis = {
        "total_mbeans": len(actual_mbeans),
        "kafka_mbeans": len(kafka_mbeans),
        "expected_found": len(found),
        "expected_missing": len(missing),
        "missing_mbeans": missing,
        "sample_actual_mbeans": kafka_mbeans[:20]  # First 20 for reference
    }
    
    with open(output_file, 'w') as f:
        json.dump(analysis, f, indent=2)
    
    print(f"\n✓ Detailed analysis saved to {output_file}")

if __name__ == "__main__":
    main()