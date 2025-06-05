package msk

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// MetricAPIClient sends dimensional metrics directly to New Relic Metric API
type MetricAPIClient struct {
	apiKey     string
	endpoint   string
	httpClient *http.Client
}

// NewMetricAPIClient creates a new Metric API client
func NewMetricAPIClient(apiKey string) *MetricAPIClient {
	return &MetricAPIClient{
		apiKey:   apiKey,
		endpoint: "https://metric-api.newrelic.com/metric/v1",
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// MetricData represents a single metric for the API
type MetricData struct {
	Name       string                 `json:"name"`
	Type       string                 `json:"type"`
	Value      interface{}           `json:"value"`
	Timestamp  int64                 `json:"timestamp"`
	Attributes map[string]interface{} `json:"attributes"`
}

// MetricPayload represents the payload sent to Metric API
type MetricPayload struct {
	Metrics []MetricData `json:"metrics"`
}

// SendGaugeMetric sends a gauge metric to New Relic
func (c *MetricAPIClient) SendGaugeMetric(name string, value float64, attributes map[string]interface{}) error {
	// Ensure all attribute values are strings
	stringAttrs := make(map[string]interface{})
	for k, v := range attributes {
		stringAttrs[k] = fmt.Sprintf("%v", v)
	}
	
	metric := MetricData{
		Name:       name,
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6, // Milliseconds not seconds
		Attributes: stringAttrs,
	}

	return c.SendMetrics([]MetricData{metric})
}

// SendMetrics sends a batch of metrics to New Relic
func (c *MetricAPIClient) SendMetrics(metrics []MetricData) error {
	if len(metrics) == 0 {
		return nil
	}
	
	log.Info("Sending %d metrics to Metric API endpoint: %s", len(metrics), c.endpoint)

	payload := MetricPayload{
		Metrics: metrics,
	}

	// Wrap payload in array as required
	payloadArray := []MetricPayload{payload}

	jsonData, err := json.Marshal(payloadArray)
	if err == nil && len(metrics) > 0 {
		// Log first metric as sample
		sample, _ := json.Marshal(metrics[0])
		log.Debug("Sample metric payload: %s", string(sample))
	}
	if err != nil {
		return fmt.Errorf("failed to marshal metrics: %v", err)
	}

	req, err := http.NewRequest("POST", c.endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Api-Key", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Error("HTTP request failed: %v", err)
		return fmt.Errorf("failed to send metrics: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		log.Error("Metric API error - Status: %d, Body: %s", resp.StatusCode, string(body))
		return fmt.Errorf("metric API returned status %d", resp.StatusCode)
	}

	log.Info("Successfully sent %d metrics to Metric API (status: %d)", len(metrics), resp.StatusCode)
	return nil
}

// BatchCollector collects metrics for efficient batch sending
type BatchCollector struct {
	client      *MetricAPIClient
	metrics     []MetricData
	maxBatch    int
	flushTicker *time.Ticker
}

// NewBatchCollector creates a new batch collector
func NewBatchCollector(client *MetricAPIClient, maxBatch int, flushInterval time.Duration) *BatchCollector {
	bc := &BatchCollector{
		client:      client,
		metrics:     make([]MetricData, 0),
		maxBatch:    maxBatch,
		flushTicker: time.NewTicker(flushInterval),
	}

	// Start background flusher
	go bc.backgroundFlusher()

	return bc
}

// AddMetric adds a metric to the batch
func (bc *BatchCollector) AddMetric(name string, value float64, attributes map[string]interface{}) {
	// Ensure all attribute values are strings
	stringAttrs := make(map[string]interface{})
	for k, v := range attributes {
		stringAttrs[k] = fmt.Sprintf("%v", v)
	}
	
	metric := MetricData{
		Name:       name,
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6, // Milliseconds not seconds
		Attributes: stringAttrs,
	}

	bc.metrics = append(bc.metrics, metric)

	// Flush if batch is full
	if len(bc.metrics) >= bc.maxBatch {
		bc.Flush()
	}
}

// Flush sends all collected metrics
func (bc *BatchCollector) Flush() error {
	if len(bc.metrics) == 0 {
		return nil
	}
	
	log.Info("Flushing %d metrics from batch collector", len(bc.metrics))

	// Copy metrics for sending
	metricsToSend := make([]MetricData, len(bc.metrics))
	copy(metricsToSend, bc.metrics)

	// Clear the buffer
	bc.metrics = bc.metrics[:0]

	// Send metrics
	return bc.client.SendMetrics(metricsToSend)
}

// backgroundFlusher periodically flushes metrics
func (bc *BatchCollector) backgroundFlusher() {
	for range bc.flushTicker.C {
		if err := bc.Flush(); err != nil {
			log.Error("Failed to flush metrics: %v", err)
		}
	}
}

// Stop stops the batch collector
func (bc *BatchCollector) Stop() {
	bc.flushTicker.Stop()
	bc.Flush()
}