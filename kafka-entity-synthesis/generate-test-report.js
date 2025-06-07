#!/usr/bin/env node

/**
 * Comprehensive Test Report Generator
 * Analyzes all test results and generates detailed reports
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class TestReportGenerator {
    constructor(config) {
        this.config = config;
        this.results = {
            timestamp: new Date().toISOString(),
            accountId: config.accountId,
            tests: [],
            entities: [],
            metrics: {},
            summary: {}
        };
    }

    async generateReport(options = {}) {
        const {
            testDirs = [],
            outputFormat = 'all', // 'json', 'html', 'markdown', 'all'
            includeScreenshots = true,
            verifyEntities = true
        } = options;

        console.log('📊 Generating Comprehensive Test Report');
        console.log('======================================\n');

        // Step 1: Collect test results
        console.log('📁 Collecting test results...');
        await this.collectTestResults(testDirs);

        // Step 2: Verify entities if requested
        if (verifyEntities) {
            console.log('\n🔍 Verifying entities in New Relic...');
            await this.verifyEntities();
        }

        // Step 3: Analyze results
        console.log('\n📈 Analyzing results...');
        this.analyzeResults();

        // Step 4: Generate reports
        console.log('\n📝 Generating reports...');
        const reports = await this.generateReports(outputFormat);

        // Step 5: Generate visualizations
        if (includeScreenshots) {
            console.log('\n📸 Generating visualizations...');
            await this.generateVisualizations();
        }

        console.log('\n✅ Report generation complete!');
        return reports;
    }

    async collectTestResults(dirs) {
        // If no specific dirs provided, find all test result directories
        if (dirs.length === 0) {
            dirs = fs.readdirSync('.')
                .filter(f => f.startsWith('test-results-') || f.startsWith('deployment-logs-'))
                .filter(f => fs.statSync(f).isDirectory());
        }

        for (const dir of dirs) {
            console.log(`  📂 Processing ${dir}...`);
            
            const testResult = {
                directory: dir,
                timestamp: this.extractTimestamp(dir),
                files: [],
                clusters: [],
                success: false
            };

            // Read all files in directory
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                const filePath = path.join(dir, file);
                
                if (file.endsWith('.log')) {
                    testResult.files.push({
                        name: file,
                        content: fs.readFileSync(filePath, 'utf8').substring(0, 10000) // First 10KB
                    });
                }

                if (file.endsWith('.cluster')) {
                    const clusterName = fs.readFileSync(filePath, 'utf8').trim();
                    testResult.clusters.push(clusterName);
                }

                if (file === 'deployment-summary.json') {
                    testResult.summary = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    testResult.success = testResult.summary.uiValidated || false;
                }
            }

            this.results.tests.push(testResult);
        }

        console.log(`  ✅ Collected results from ${this.results.tests.length} test runs`);
    }

    async verifyEntities() {
        // Collect all unique cluster names
        const clusterNames = new Set();
        this.results.tests.forEach(test => {
            test.clusters.forEach(cluster => clusterNames.add(cluster));
        });

        console.log(`  🔍 Verifying ${clusterNames.size} unique clusters...`);

        for (const clusterName of clusterNames) {
            try {
                const entityData = await this.checkEntity(clusterName);
                this.results.entities.push({
                    clusterName,
                    ...entityData
                });
                
                const status = entityData.exists ? '✅' : '❌';
                console.log(`    ${status} ${clusterName}: ${entityData.entityCount} entities`);
            } catch (error) {
                console.log(`    ❌ ${clusterName}: Error - ${error.message}`);
            }
        }
    }

    async checkEntity(clusterName) {
        const nrqlUrl = `https://insights-api.newrelic.com/v1/accounts/${this.config.accountId}/query`;
        
        // Check for cluster entities
        const clusterQuery = `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`;
        const brokerQuery = `FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`;
        const topicQuery = `FROM AwsMskTopicSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`;
        
        const results = await Promise.all([
            this.runNRQL(clusterQuery),
            this.runNRQL(brokerQuery),
            this.runNRQL(topicQuery)
        ]);

        const clusterCount = results[0]?.results?.[0]?.count || 0;
        const brokerCount = results[1]?.results?.[0]?.count || 0;
        const topicCount = results[2]?.results?.[0]?.count || 0;

        // Check entity via GraphQL
        const entityExists = await this.checkEntityViaGraphQL(clusterName);

        return {
            exists: entityExists,
            events: {
                clusters: clusterCount,
                brokers: brokerCount,
                topics: topicCount
            },
            entityCount: entityExists ? 1 : 0,
            hasData: clusterCount > 0 || brokerCount > 0 || topicCount > 0
        };
    }

    async runNRQL(query) {
        try {
            const response = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${this.config.accountId}/query`,
                {
                    params: { nrql: query },
                    headers: {
                        'X-Query-Key': this.config.apiKey,
                        'Accept': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            return null;
        }
    }

    async checkEntityViaGraphQL(clusterName) {
        const query = `{
            actor {
                entitySearch(query: "domain='INFRA' AND type='AWSMSKCLUSTER' AND name='${clusterName}'") {
                    count
                }
            }
        }`;

        try {
            const response = await axios.post(
                'https://api.newrelic.com/graphql',
                { query },
                {
                    headers: {
                        'Api-Key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return (response.data?.data?.actor?.entitySearch?.count || 0) > 0;
        } catch (error) {
            return false;
        }
    }

    analyzeResults() {
        const summary = {
            totalTests: this.results.tests.length,
            successfulTests: 0,
            failedTests: 0,
            totalClusters: 0,
            entitiesCreated: 0,
            entitiesWithData: 0,
            strategies: {},
            timestamps: {
                earliest: null,
                latest: null
            }
        };

        // Analyze test results
        this.results.tests.forEach(test => {
            if (test.success) summary.successfulTests++;
            else summary.failedTests++;
            
            summary.totalClusters += test.clusters.length;

            // Track strategies
            if (test.summary?.deploymentMode) {
                summary.strategies[test.summary.deploymentMode] = 
                    (summary.strategies[test.summary.deploymentMode] || 0) + 1;
            }

            // Track timestamps
            const timestamp = new Date(test.timestamp || 0);
            if (!summary.timestamps.earliest || timestamp < summary.timestamps.earliest) {
                summary.timestamps.earliest = timestamp;
            }
            if (!summary.timestamps.latest || timestamp > summary.timestamps.latest) {
                summary.timestamps.latest = timestamp;
            }
        });

        // Analyze entity results
        this.results.entities.forEach(entity => {
            if (entity.exists) summary.entitiesCreated++;
            if (entity.hasData) summary.entitiesWithData++;
        });

        // Calculate success rate
        summary.successRate = summary.totalTests > 0 
            ? Math.round((summary.successfulTests / summary.totalTests) * 100) 
            : 0;

        summary.entityCreationRate = summary.totalClusters > 0
            ? Math.round((summary.entitiesCreated / summary.totalClusters) * 100)
            : 0;

        this.results.summary = summary;
    }

    async generateReports(format) {
        const reports = {};
        const timestamp = Date.now();

        if (format === 'json' || format === 'all') {
            const jsonFile = `test-report-${timestamp}.json`;
            fs.writeFileSync(jsonFile, JSON.stringify(this.results, null, 2));
            reports.json = jsonFile;
            console.log(`  ✅ JSON report: ${jsonFile}`);
        }

        if (format === 'markdown' || format === 'all') {
            const mdFile = `test-report-${timestamp}.md`;
            const mdContent = this.generateMarkdownReport();
            fs.writeFileSync(mdFile, mdContent);
            reports.markdown = mdFile;
            console.log(`  ✅ Markdown report: ${mdFile}`);
        }

        if (format === 'html' || format === 'all') {
            const htmlFile = `test-report-${timestamp}.html`;
            const htmlContent = this.generateHTMLReport();
            fs.writeFileSync(htmlFile, htmlContent);
            reports.html = htmlFile;
            console.log(`  ✅ HTML report: ${htmlFile}`);
        }

        return reports;
    }

    generateMarkdownReport() {
        const s = this.results.summary;
        
        let md = `# MSK Entity Synthesis Test Report

**Generated**: ${this.results.timestamp}
**Account ID**: ${this.results.accountId}

## Executive Summary

- **Total Test Runs**: ${s.totalTests}
- **Successful**: ${s.successfulTests} (${s.successRate}%)
- **Failed**: ${s.failedTests}
- **Total Clusters Created**: ${s.totalClusters}
- **Entities in New Relic**: ${s.entitiesCreated} (${s.entityCreationRate}%)
- **Entities with Data**: ${s.entitiesWithData}

## Test Timeline

- **First Test**: ${s.timestamps.earliest || 'N/A'}
- **Last Test**: ${s.timestamps.latest || 'N/A'}
- **Duration**: ${this.calculateDuration(s.timestamps.earliest, s.timestamps.latest)}

## Strategy Breakdown

| Strategy | Count | Percentage |
|----------|-------|------------|
${Object.entries(s.strategies).map(([strategy, count]) => 
    `| ${strategy} | ${count} | ${Math.round((count / s.totalTests) * 100)}% |`
).join('\n')}

## Entity Verification Results

| Cluster Name | Entity Exists | Has Events | Cluster Events | Broker Events | Topic Events |
|--------------|---------------|------------|----------------|---------------|--------------|
${this.results.entities.map(e => 
    `| ${e.clusterName} | ${e.exists ? '✅' : '❌'} | ${e.hasData ? '✅' : '❌'} | ${e.events.clusters} | ${e.events.brokers} | ${e.events.topics} |`
).join('\n')}

## Test Run Details

${this.results.tests.map(test => `
### ${test.directory}

- **Timestamp**: ${test.timestamp || 'Unknown'}
- **Clusters**: ${test.clusters.join(', ') || 'None'}
- **Success**: ${test.success ? '✅' : '❌'}
- **Files**: ${test.files.length}
${test.summary ? `
- **Mode**: ${test.summary.deploymentMode}
- **UI Validated**: ${test.summary.uiValidated ? '✅' : '❌'}
` : ''}
`).join('\n')}

## Recommendations

${this.generateRecommendations()}

## Next Steps

1. **For Failed Entities**:
   - Check API key permissions
   - Verify account ID is correct
   - Ensure entity synthesis is enabled

2. **For Successful Entities**:
   - Check Entity Explorer: https://one.newrelic.com/redirect/entity/${this.results.accountId}
   - Check Message Queues UI: https://one.newrelic.com/nr1-core/message-queues
   - Run continuous verification

3. **For Production Deployment**:
   - Use the production deployment script: \`./deploy-msk-entities.sh\`
   - Enable continuous metric streaming
   - Set up alerts for entity health
`;

        return md;
    }

    generateHTMLReport() {
        const s = this.results.summary;
        
        return `<!DOCTYPE html>
<html>
<head>
    <title>MSK Entity Synthesis Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1, h2, h3 { color: #333; }
        h1 { border-bottom: 3px solid #008c99; padding-bottom: 10px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; color: #008c99; }
        .stat-label { color: #666; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: bold; }
        .success { color: #28a745; }
        .failure { color: #dc3545; }
        .chart { margin: 20px 0; }
        .progress-bar { width: 100%; height: 30px; background: #e9ecef; border-radius: 15px; overflow: hidden; }
        .progress-fill { height: 100%; background: #008c99; transition: width 0.3s; }
    </style>
</head>
<body>
    <div class="container">
        <h1>MSK Entity Synthesis Test Report</h1>
        <p><strong>Generated:</strong> ${this.results.timestamp}</p>
        <p><strong>Account ID:</strong> ${this.results.accountId}</p>

        <h2>Executive Summary</h2>
        <div class="summary">
            <div class="stat-card">
                <div class="stat-value">${s.totalTests}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${s.successRate}%</div>
                <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${s.totalClusters}</div>
                <div class="stat-label">Clusters Created</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${s.entityCreationRate}%</div>
                <div class="stat-label">Entity Creation Rate</div>
            </div>
        </div>

        <h2>Success Rate</h2>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${s.successRate}%"></div>
        </div>

        <h2>Entity Verification Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Cluster Name</th>
                    <th>Entity Exists</th>
                    <th>Has Events</th>
                    <th>Cluster Events</th>
                    <th>Broker Events</th>
                    <th>Topic Events</th>
                </tr>
            </thead>
            <tbody>
                ${this.results.entities.map(e => `
                <tr>
                    <td>${e.clusterName}</td>
                    <td class="${e.exists ? 'success' : 'failure'}">${e.exists ? '✅' : '❌'}</td>
                    <td class="${e.hasData ? 'success' : 'failure'}">${e.hasData ? '✅' : '❌'}</td>
                    <td>${e.events.clusters}</td>
                    <td>${e.events.brokers}</td>
                    <td>${e.events.topics}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>

        <h2>Test Timeline</h2>
        <p><strong>First Test:</strong> ${s.timestamps.earliest || 'N/A'}</p>
        <p><strong>Last Test:</strong> ${s.timestamps.latest || 'N/A'}</p>
        <p><strong>Total Duration:</strong> ${this.calculateDuration(s.timestamps.earliest, s.timestamps.latest)}</p>

        <h2>Quick Links</h2>
        <ul>
            <li><a href="https://one.newrelic.com/redirect/entity/${this.results.accountId}" target="_blank">Entity Explorer</a></li>
            <li><a href="https://one.newrelic.com/nr1-core/message-queues" target="_blank">Message Queues UI</a></li>
            <li><a href="https://one.newrelic.com/data-exploration" target="_blank">NRQL Console</a></li>
        </ul>
    </div>
</body>
</html>`;
    }

    generateRecommendations() {
        const s = this.results.summary;
        const recommendations = [];

        if (s.successRate < 50) {
            recommendations.push('- **Critical**: Success rate is below 50%. Review API credentials and permissions.');
        }

        if (s.entityCreationRate < 50) {
            recommendations.push('- **Important**: Entity creation rate is low. Entity synthesis may not be working properly.');
        }

        if (s.entitiesWithData < s.entitiesCreated) {
            recommendations.push('- **Notice**: Some entities exist but have no data. Check metric streaming.');
        }

        if (s.failedTests > 0) {
            recommendations.push(`- **Action Required**: ${s.failedTests} tests failed. Review logs for errors.`);
        }

        if (recommendations.length === 0) {
            recommendations.push('- **Excellent**: All systems functioning normally!');
        }

        return recommendations.join('\n');
    }

    async generateVisualizations() {
        // Create simple ASCII visualizations
        const viz = `
Entity Creation Success Rate:
[${this.generateProgressBar(this.results.summary.entityCreationRate)}] ${this.results.summary.entityCreationRate}%

Test Success Rate:
[${this.generateProgressBar(this.results.summary.successRate)}] ${this.results.summary.successRate}%

Entities by Type:
Clusters: ${this.results.entities.filter(e => e.exists).length}
With Data: ${this.results.entities.filter(e => e.hasData).length}
`;

        fs.writeFileSync('test-report-visualization.txt', viz);
        console.log('  ✅ Visualization saved: test-report-visualization.txt');
    }

    generateProgressBar(percentage, width = 20) {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    extractTimestamp(dirname) {
        const match = dirname.match(/(\d{8})-(\d{6})/);
        if (match) {
            const date = match[1];
            const time = match[2];
            return new Date(
                date.substr(0, 4) + '-' + 
                date.substr(4, 2) + '-' + 
                date.substr(6, 2) + 'T' +
                time.substr(0, 2) + ':' +
                time.substr(2, 2) + ':' +
                time.substr(4, 2)
            ).toISOString();
        }
        return new Date().toISOString();
    }

    calculateDuration(start, end) {
        if (!start || !end) return 'N/A';
        const diff = new Date(end) - new Date(start);
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        return `${hours}h ${minutes}m`;
    }
}

// CLI
if (require.main === module) {
    async function main() {
        const config = {
            accountId: process.env.NEW_RELIC_ACCOUNT_ID,
            apiKey: process.env.NEW_RELIC_API_KEY
        };

        if (!config.accountId || !config.apiKey) {
            console.error('❌ Please set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY');
            process.exit(1);
        }

        const generator = new TestReportGenerator(config);
        
        const args = process.argv.slice(2);
        const options = {
            testDirs: args.filter(a => !a.startsWith('--')),
            outputFormat: args.includes('--json') ? 'json' : 
                         args.includes('--html') ? 'html' :
                         args.includes('--markdown') ? 'markdown' : 'all',
            verifyEntities: !args.includes('--skip-verify')
        };

        const reports = await generator.generateReport(options);
        
        console.log('\n📁 Generated reports:');
        Object.entries(reports).forEach(([format, file]) => {
            console.log(`  - ${format.toUpperCase()}: ${file}`);
        });
    }

    main().catch(console.error);
}

module.exports = { TestReportGenerator };