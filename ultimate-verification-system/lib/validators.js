/**
 * Validators for test results
 */

const { thresholds } = require('./config');

class Validators {
    /**
     * Validate entity existence
     */
    static validateEntityExistence(result) {
        if (!result || !Array.isArray(result) || result.length === 0) {
            return { passed: false, message: 'No query results returned' };
        }

        const count = result[0]?.count || 0;
        
        if (count === 0) {
            return { passed: false, message: 'No Kafka entities found in the system' };
        }

        return { 
            passed: true, 
            message: `Found ${count} entity samples` 
        };
    }

    /**
     * Validate UI visibility fields
     */
    static validateUIFields(result, provider) {
        if (!result || result.length === 0 || result[0].samples === 0) {
            return { passed: false, message: 'No samples found - integration may not be running' };
        }

        const data = result[0];
        const missing = [];

        // Check each required field
        if (provider === 'awsMsk') {
            if (data.providerField < 100) missing.push('provider');
            if (data.awsAccountId < 100) missing.push('awsAccountId');
            if (data.awsRegion < 100) missing.push('awsRegion');
            if (data.instrumentationProvider < 100) missing.push('instrumentation.provider');
            if (data.entityName < 100) missing.push('entityName');
            
            // Entity GUID is optional but recommended
            if (data.entityGuid < thresholds.entityGuid.warning) {
                missing.push(`entity.guid (${Math.round(data.entityGuid)}%)`);
            }
        } else {
            if (data.accountTag < 95) missing.push('account tag');
            if (data.envId < 95) missing.push('environment ID');
            if (data.clusterId < 95) missing.push('cluster ID');
        }

        return {
            passed: missing.length === 0,
            message: missing.length > 0 
                ? `❌ CRITICAL: Missing UI fields: ${missing.join(', ')}. Entities won't appear in UI!`
                : '✅ All UI visibility fields present'
        };
    }

    /**
     * Validate dimensional metrics
     */
    static validateDimensionalMetrics(result) {
        if (!result || result.length === 0) {
            return { passed: false, message: 'No query results for dimensional metrics' };
        }

        const data = result[0];
        
        if (data.total === 0) {
            return { 
                passed: false, 
                message: '❌ No dimensional metrics found - queries won\'t work!' 
            };
        }

        return { 
            passed: true, 
            message: `Found ${data.total} dimensional metrics (${data.uniqueMetrics} types, ${data.entityTypes} entity types)` 
        };
    }

    /**
     * Validate data freshness
     */
    static validateDataFreshness(result) {
        if (!result || result.length === 0 || !result[0].latest) {
            return { passed: false, message: 'No recent data found' };
        }

        const latest = result[0].latest;
        const minutesOld = (Date.now() - latest) / 60000;
        
        if (minutesOld > thresholds.dataFreshness.critical) {
            return {
                passed: false,
                message: `Data is ${Math.round(minutesOld)} minutes old (>${thresholds.dataFreshness.critical} min threshold)`
            };
        }

        if (minutesOld > thresholds.dataFreshness.warning) {
            return {
                passed: true,
                message: `⚠️ Data is ${Math.round(minutesOld)} minutes old (>${thresholds.dataFreshness.warning} min warning)`
            };
        }

        return {
            passed: true,
            message: `Data is ${Math.round(minutesOld)} minutes old`
        };
    }

    /**
     * Validate account aggregation
     */
    static validateAccountAggregation(results) {
        // Handle both array (FACET) and single result cases
        if (!results || (Array.isArray(results) && results.length === 0)) {
            return { passed: false, message: 'No account data for home page table' };
        }

        // Convert single result to array for uniform handling
        const resultsArray = Array.isArray(results) ? results : [results];
        
        const totalClusters = resultsArray.reduce((sum, r) => sum + (r.clusterCount || 0), 0);
        const unhealthyClusters = resultsArray.reduce((sum, r) => sum + (r.unhealthyCount || 0), 0);

        return {
            passed: true,
            message: `Found ${resultsArray.length} account(s) with ${totalClusters} total clusters${unhealthyClusters > 0 ? ` (${unhealthyClusters} unhealthy)` : ''}`
        };
    }

    /**
     * Validate throughput metrics
     */
    static validateThroughputMetrics(result) {
        if (!result || result.length === 0) {
            return { passed: false, message: 'No throughput data available' };
        }

        const data = result[0];
        const hasData = (data.totalBytesIn !== null && data.totalBytesIn !== undefined) || 
                       (data.totalBytesOut !== null && data.totalBytesOut !== undefined);

        if (!hasData) {
            return { passed: false, message: 'No throughput metrics found' };
        }

        const bytesIn = data.totalBytesIn || 0;
        const bytesOut = data.totalBytesOut || 0;

        return {
            passed: true,
            message: `Throughput: ${Validators.formatBytes(bytesIn)}/s in, ${Validators.formatBytes(bytesOut)}/s out`
        };
    }

    /**
     * Validate time series data
     */
    static validateTimeSeriesData(results) {
        if (!Array.isArray(results) || results.length === 0) {
            return { passed: false, message: 'No time series data available' };
        }

        const validPoints = results.filter(r => r && r.throughput !== null).length;
        
        if (validPoints === 0) {
            return { passed: false, message: 'Time series has no valid data points' };
        }

        return {
            passed: true,
            message: `Time series has ${validPoints} data points`
        };
    }

    /**
     * Validate health metrics
     */
    static validateHealthMetrics(results, provider) {
        if (!results || (Array.isArray(results) && results.length === 0)) {
            return { passed: false, message: 'No health metrics found' };
        }

        if (provider === 'awsMsk') {
            const unhealthy = Array.isArray(results) 
                ? results.filter(r => r.offlinePartitions > 0 || r.underReplicated > 0)
                : [];
            
            return {
                passed: true,
                message: unhealthy.length > 0 
                    ? `⚠️ ${unhealthy.length} unhealthy clusters found`
                    : '✅ All clusters healthy'
            };
        }

        return { passed: true, message: 'Health metrics available' };
    }

    /**
     * Format bytes to human readable
     */
    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = Validators;