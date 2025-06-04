package msk

import (
	"fmt"
	"regexp"
	"sync"
	"time"

	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// SystemSampleCorrelator correlates Kafka metrics with system metrics from Infrastructure agent
// This version includes support for disk mount regex patterns and NetworkSample correlation
type SystemSampleCorrelator struct {
	cache          map[string]*SystemMetrics
	mu             sync.RWMutex
	infraAPI       InfrastructureAPI
	diskMountRegex *regexp.Regexp
	logMountRegex  *regexp.Regexp
}

// SystemMetrics holds enhanced system-level metrics for a host
type SystemMetrics struct {
	// CPU metrics
	CPUUser   float64
	CPUSystem float64
	CPUIdle   float64
	
	// Memory metrics
	MemoryUsed float64
	MemoryFree float64
	
	// Disk metrics
	RootDiskUsed      float64
	DataDiskUsed      float64 // Kafka data directories
	LogDiskUsed       float64 // Kafka log directories
	DiskUsedByMount   map[string]float64
	
	// Network metrics
	NetworkRxThroughput float64 // bytes per second
	NetworkTxThroughput float64 // bytes per second
	NetworkRxDropped    float64
	NetworkTxDropped    float64
	NetworkRxErrors     float64
	NetworkTxErrors     float64
	
	LastUpdated time.Time
}

// InfrastructureAPIV2 enhanced interface for querying Infrastructure agent data
type InfrastructureAPIV2 interface {
	InfrastructureAPI
	QueryNetworkSample(hostname string, since time.Duration) (*NetworkMetrics, error)
	QueryStorageSample(hostname string, since time.Duration) ([]DiskMetrics, error)
}

// NetworkMetrics from NetworkSample
type NetworkMetrics struct {
	ReceiveBytesPerSecond    float64
	TransmitBytesPerSecond   float64
	ReceiveDroppedPerSecond  float64
	TransmitDroppedPerSecond float64
	ReceiveErrorsPerSecond   float64
	TransmitErrorsPerSecond  float64
}

// DiskMetrics from StorageSample
type DiskMetrics struct {
	MountPoint      string
	DiskUsedPercent float64
	DiskUsedBytes   float64
	DiskFreeBytes   float64
}

// NewSystemSampleCorrelator creates a new enhanced system sample correlator
func NewSystemSampleCorrelator(api InfrastructureAPI, diskMountPattern, logMountPattern string) *SystemSampleCorrelator {
	correlator := &SystemSampleCorrelator{
		cache:    make(map[string]*SystemMetrics),
		infraAPI: api,
	}
	
	// Compile regex patterns
	if diskMountPattern != "" {
		correlator.diskMountRegex = regexp.MustCompile(diskMountPattern)
	}
	if logMountPattern != "" {
		correlator.logMountRegex = regexp.MustCompile(logMountPattern)
	}
	
	return correlator
}

// GetMetricsForHost retrieves enhanced system metrics for a specific host
func (s *SystemSampleCorrelator) GetMetricsForHost(hostname string) (*SystemMetrics, error) {
	s.mu.RLock()
	metrics, exists := s.cache[hostname]
	s.mu.RUnlock()

	// Check if we have recent metrics
	if exists && time.Since(metrics.LastUpdated) <= 60*time.Second {
		return metrics, nil
	}

	// Fetch fresh metrics
	freshMetrics, err := s.fetchSystemMetrics(hostname)
	if err != nil {
		// Return cached metrics if available, even if stale
		if exists {
			log.Warn("Using stale system metrics for host %s: %v", hostname, err)
			return metrics, nil
		}
		return nil, err
	}

	// Update cache
	s.mu.Lock()
	s.cache[hostname] = freshMetrics
	s.mu.Unlock()

	return freshMetrics, nil
}

// fetchSystemMetrics retrieves fresh system metrics from Infrastructure agent
func (s *SystemSampleCorrelator) fetchSystemMetrics(hostname string) (*SystemMetrics, error) {
	metrics := &SystemMetrics{
		DiskUsedByMount: make(map[string]float64),
		LastUpdated:     time.Now(),
	}
	
	if s.infraAPI == nil {
		// Return default metrics if no API available
		metrics.CPUIdle = 100
		metrics.MemoryFree = 100
		return metrics, nil
	}

	// Fetch basic system metrics
	basicMetrics, err := s.infraAPI.QuerySystemSample(hostname, 1*time.Minute)
	if err != nil {
		log.Warn("Failed to query SystemSample for %s: %v", hostname, err)
	} else if basicMetrics != nil {
		metrics.CPUUser = basicMetrics.CPUUser
		metrics.CPUSystem = basicMetrics.CPUSystem
		metrics.CPUIdle = basicMetrics.CPUIdle
		metrics.MemoryUsed = basicMetrics.MemoryUsed
		metrics.MemoryFree = basicMetrics.MemoryFree
	}

	// Fetch network metrics if available
	if apiV2, ok := s.infraAPI.(InfrastructureAPIV2); ok {
		networkMetrics, err := apiV2.QueryNetworkSample(hostname, 1*time.Minute)
		if err != nil {
			log.Warn("Failed to query NetworkSample for %s: %v", hostname, err)
		} else if networkMetrics != nil {
			metrics.NetworkRxThroughput = networkMetrics.ReceiveBytesPerSecond
			metrics.NetworkTxThroughput = networkMetrics.TransmitBytesPerSecond
			metrics.NetworkRxDropped = networkMetrics.ReceiveDroppedPerSecond
			metrics.NetworkTxDropped = networkMetrics.TransmitDroppedPerSecond
			metrics.NetworkRxErrors = networkMetrics.ReceiveErrorsPerSecond
			metrics.NetworkTxErrors = networkMetrics.TransmitErrorsPerSecond
		}
		
		// Fetch disk metrics
		diskMetrics, err := apiV2.QueryStorageSample(hostname, 1*time.Minute)
		if err != nil {
			log.Warn("Failed to query StorageSample for %s: %v", hostname, err)
		} else {
			s.processDiskMetrics(metrics, diskMetrics)
		}
	}

	return metrics, nil
}

// processDiskMetrics processes disk metrics and applies mount point filtering
func (s *SystemSampleCorrelator) processDiskMetrics(metrics *SystemMetrics, diskMetrics []DiskMetrics) {
	for _, disk := range diskMetrics {
		// Store all disk usage by mount point
		metrics.DiskUsedByMount[disk.MountPoint] = disk.DiskUsedPercent
		
		// Check for root disk
		if disk.MountPoint == "/" {
			metrics.RootDiskUsed = disk.DiskUsedPercent
		}
		
		// Check for Kafka data directories
		if s.diskMountRegex != nil && s.diskMountRegex.MatchString(disk.MountPoint) {
			// Use the highest usage among matching mounts
			if disk.DiskUsedPercent > metrics.DataDiskUsed {
				metrics.DataDiskUsed = disk.DiskUsedPercent
			}
		}
		
		// Check for Kafka log directories
		if s.logMountRegex != nil && s.logMountRegex.MatchString(disk.MountPoint) {
			// Use the highest usage among matching mounts
			if disk.DiskUsedPercent > metrics.LogDiskUsed {
				metrics.LogDiskUsed = disk.DiskUsedPercent
			}
		}
	}
	
	// If data disk wasn't matched, fall back to root
	if metrics.DataDiskUsed == 0 && metrics.RootDiskUsed > 0 {
		metrics.DataDiskUsed = metrics.RootDiskUsed
	}
}

// EnrichBrokerWithSystemMetrics adds enhanced system metrics to broker data
func (s *SystemSampleCorrelator) EnrichBrokerWithSystemMetrics(brokerData map[string]interface{}, hostname string) error {
	metrics, err := s.GetMetricsForHost(hostname)
	if err != nil {
		// Log but don't fail - system metrics are optional
		log.Debug("No system metrics available for host %s: %v", hostname, err)
		return nil
	}

	// Add CPU metrics
	brokerData["broker.cpuUser"] = metrics.CPUUser
	brokerData["broker.cpuSystem"] = metrics.CPUSystem
	brokerData["broker.cpuIdle"] = metrics.CPUIdle

	// Add memory metrics
	brokerData["broker.memoryUsed"] = metrics.MemoryUsed
	brokerData["broker.memoryFree"] = metrics.MemoryFree

	// Add disk metrics
	brokerData["broker.rootDiskUsed"] = metrics.RootDiskUsed
	brokerData["broker.kafkaDataLogsDiskUsed"] = metrics.DataDiskUsed
	brokerData["broker.kafkaAppLogsDiskUsed"] = metrics.LogDiskUsed

	// Add network metrics
	brokerData["broker.networkRxThroughput"] = metrics.NetworkRxThroughput
	brokerData["broker.networkTxThroughput"] = metrics.NetworkTxThroughput
	brokerData["broker.networkRxDropped"] = metrics.NetworkRxDropped
	brokerData["broker.networkTxDropped"] = metrics.NetworkTxDropped
	brokerData["broker.networkRxErrors"] = metrics.NetworkRxErrors
	brokerData["broker.networkTxErrors"] = metrics.NetworkTxErrors

	log.Debug("Enriched broker %s with system metrics: CPU=%.1f%%, Memory=%.1f%%, DataDisk=%.1f%%",
		hostname, 100-metrics.CPUIdle, metrics.MemoryUsed, metrics.DataDiskUsed)

	return nil
}

// GetDiskUsageForMount returns disk usage for a specific mount point
func (s *SystemSampleCorrelator) GetDiskUsageForMount(hostname, mountPoint string) (float64, error) {
	metrics, err := s.GetMetricsForHost(hostname)
	if err != nil {
		return 0, err
	}

	if usage, exists := metrics.DiskUsedByMount[mountPoint]; exists {
		return usage, nil
	}

	return 0, fmt.Errorf("mount point %s not found for host %s", mountPoint, hostname)
}

// ClearCache removes all cached metrics
func (s *SystemSampleCorrelator) ClearCache() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache = make(map[string]*SystemMetrics)
}