package msk

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// DiskMountDetector auto-detects Kafka data and log directories
type DiskMountDetector struct {
	kafkaConfigPaths []string
	commonDataPaths  []string
	commonLogPaths   []string
}

// NewDiskMountDetector creates a new disk mount detector
func NewDiskMountDetector() *DiskMountDetector {
	return &DiskMountDetector{
		kafkaConfigPaths: []string{
			"/etc/kafka/server.properties",
			"/opt/kafka/config/server.properties",
			"/usr/local/kafka/config/server.properties",
			"/var/kafka/server.properties",
		},
		commonDataPaths: []string{
			"/var/kafka-logs",
			"/opt/kafka/logs",
			"/data/kafka",
			"/mnt/kafka",
			"/kafka-logs",
			"/var/lib/kafka",
			"/mnt/data/kafka",
		},
		commonLogPaths: []string{
			"/var/log/kafka",
			"/opt/kafka/logs",
			"/logs/kafka",
			"/var/kafka/logs",
			"/mnt/logs/kafka",
		},
	}
}

// DetectKafkaDataMounts attempts to auto-detect Kafka data directories
func (d *DiskMountDetector) DetectKafkaDataMounts() (string, error) {
	log.Debug("Auto-detecting Kafka data mounts...")

	// First, try to read from Kafka configuration
	dataDirs := d.readKafkaConfig("log.dirs", "log.dir")
	if len(dataDirs) > 0 {
		pattern := d.createRegexPattern(dataDirs)
		log.Info("Detected Kafka data directories from config: %v, pattern: %s", dataDirs, pattern)
		return pattern, nil
	}

	// Second, check common paths
	existingPaths := d.findExistingPaths(d.commonDataPaths)
	if len(existingPaths) > 0 {
		pattern := d.createRegexPattern(existingPaths)
		log.Info("Detected Kafka data directories from common paths: %v, pattern: %s", existingPaths, pattern)
		return pattern, nil
	}

	// Third, scan mount points for kafka-related paths
	mountPaths := d.scanMountPoints("kafka|data")
	if len(mountPaths) > 0 {
		pattern := d.createRegexPattern(mountPaths)
		log.Info("Detected Kafka data directories from mount scan: %v, pattern: %s", mountPaths, pattern)
		return pattern, nil
	}

	// Default fallback
	defaultPattern := "kafka-logs|kafka.*data|data.*kafka"
	log.Warn("Could not auto-detect Kafka data directories, using default pattern: %s", defaultPattern)
	return defaultPattern, nil
}

// DetectKafkaLogMounts attempts to auto-detect Kafka application log directories
func (d *DiskMountDetector) DetectKafkaLogMounts() (string, error) {
	log.Debug("Auto-detecting Kafka log mounts...")

	// Check common log paths
	existingPaths := d.findExistingPaths(d.commonLogPaths)
	if len(existingPaths) > 0 {
		pattern := d.createRegexPattern(existingPaths)
		log.Info("Detected Kafka log directories: %v, pattern: %s", existingPaths, pattern)
		return pattern, nil
	}

	// Scan for log-related mount points
	mountPaths := d.scanMountPoints("kafka.*log|log.*kafka")
	if len(mountPaths) > 0 {
		pattern := d.createRegexPattern(mountPaths)
		log.Info("Detected Kafka log directories from mount scan: %v, pattern: %s", mountPaths, pattern)
		return pattern, nil
	}

	// Default fallback
	defaultPattern := "kafka.*logs|logs.*kafka|var/log/kafka"
	log.Warn("Could not auto-detect Kafka log directories, using default pattern: %s", defaultPattern)
	return defaultPattern, nil
}

// readKafkaConfig reads Kafka configuration file for specific properties
func (d *DiskMountDetector) readKafkaConfig(properties ...string) []string {
	for _, configPath := range d.kafkaConfigPaths {
		if dirs := d.readPropertiesFile(configPath, properties...); len(dirs) > 0 {
			return dirs
		}
	}
	return nil
}

// readPropertiesFile reads a properties file and extracts values
func (d *DiskMountDetector) readPropertiesFile(path string, properties ...string) []string {
	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()

	var results []string
	scanner := bufio.NewScanner(file)
	
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}

		for _, prop := range properties {
			if strings.HasPrefix(line, prop+"=") {
				value := strings.TrimPrefix(line, prop+"=")
				// Handle comma-separated directories
				dirs := strings.Split(value, ",")
				for _, dir := range dirs {
					dir = strings.TrimSpace(dir)
					if dir != "" {
						results = append(results, dir)
					}
				}
			}
		}
	}

	return results
}

// findExistingPaths checks which paths actually exist on the system
func (d *DiskMountDetector) findExistingPaths(paths []string) []string {
	var existing []string
	for _, path := range paths {
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			existing = append(existing, path)
		}
	}
	return existing
}

// scanMountPoints scans /proc/mounts for matching mount points
func (d *DiskMountDetector) scanMountPoints(pattern string) []string {
	file, err := os.Open("/proc/mounts")
	if err != nil {
		return nil
	}
	defer file.Close()

	regex := regexp.MustCompile(pattern)
	var matches []string
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 2 {
			mountPoint := fields[1]
			if regex.MatchString(mountPoint) {
				matches = append(matches, mountPoint)
			}
		}
	}

	return matches
}

// createRegexPattern creates a regex pattern from paths
func (d *DiskMountDetector) createRegexPattern(paths []string) string {
	if len(paths) == 0 {
		return ""
	}

	// Extract unique mount points or parent directories
	patterns := make(map[string]bool)
	for _, path := range paths {
		// Get the mount point or significant parent
		parts := strings.Split(filepath.Clean(path), "/")
		for i := len(parts); i > 0; i-- {
			candidate := strings.Join(parts[:i], "/")
			if candidate != "" && candidate != "/" {
				// Add both the exact path and a pattern
				patterns[regexp.QuoteMeta(candidate)] = true
				// Also add a more flexible pattern
				if strings.Contains(candidate, "kafka") {
					patterns[strings.ReplaceAll(candidate, "kafka", "kafka.*")] = true
				}
			}
		}
	}

	// Convert to slice and join
	var patternSlice []string
	for p := range patterns {
		patternSlice = append(patternSlice, p)
	}

	return strings.Join(patternSlice, "|")
}

// ValidateAndEnhancePattern validates and potentially enhances a user-provided pattern
func (d *DiskMountDetector) ValidateAndEnhancePattern(userPattern string) string {
	if userPattern == "" {
		detected, _ := d.DetectKafkaDataMounts()
		return detected
	}

	// Validate the regex
	_, err := regexp.Compile(userPattern)
	if err != nil {
		log.Warn("Invalid disk mount regex pattern: %s, using auto-detection", userPattern)
		detected, _ := d.DetectKafkaDataMounts()
		return detected
	}

	// Check if pattern matches any actual mount points
	mounts := d.scanMountPoints(userPattern)
	if len(mounts) == 0 {
		log.Warn("Disk mount pattern '%s' doesn't match any mount points, trying auto-detection", userPattern)
		// Try to combine with auto-detected patterns
		detected, _ := d.DetectKafkaDataMounts()
		if detected != userPattern {
			return fmt.Sprintf("%s|%s", userPattern, detected)
		}
	}

	return userPattern
}

// GetKafkaDirectoryInfo provides information about detected Kafka directories
type KafkaDirectoryInfo struct {
	DataDirectories []string
	LogDirectories  []string
	DataPattern     string
	LogPattern      string
}

// GetDirectoryInfo returns comprehensive directory detection information
func (d *DiskMountDetector) GetDirectoryInfo() *KafkaDirectoryInfo {
	info := &KafkaDirectoryInfo{}

	// Detect data directories
	dataDirs := d.readKafkaConfig("log.dirs", "log.dir")
	if len(dataDirs) == 0 {
		dataDirs = d.findExistingPaths(d.commonDataPaths)
	}
	info.DataDirectories = dataDirs
	info.DataPattern, _ = d.DetectKafkaDataMounts()

	// Detect log directories
	info.LogDirectories = d.findExistingPaths(d.commonLogPaths)
	info.LogPattern, _ = d.DetectKafkaLogMounts()

	return info
}