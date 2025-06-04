const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID || '3630072';
const API_KEY = process.env.NEW_RELIC_API_KEY;

if (!API_KEY) {
    console.error('Error: NEW_RELIC_API_KEY not set in environment');
    process.exit(1);
}

const dashboardConfig = {
    name: "Kafka Monitoring Dashboard - Complete",
    description: "Comprehensive Kafka monitoring with broker, topic, consumer lag, and performance metrics",
    permissions: "PUBLIC_READ_ONLY",
    pages: [
        {
            name: "Overview",
            description: "Kafka cluster health and performance overview",
            widgets: [
                {
                    title: "Cluster Health Summary",
                    configuration: {
                        billboard: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT uniqueCount(displayName) AS 'Active Brokers' FROM KafkaBrokerSample SINCE 10 minutes ago"
                                },
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT uniqueCount(topic) AS 'Active Topics' FROM KafkaTopicSample SINCE 10 minutes ago"
                                },
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT sum(topic.underReplicatedPartitions) AS 'Under Replicated Partitions' FROM KafkaTopicSample SINCE 10 minutes ago"
                                },
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(consumer.totalLag) AS 'Avg Consumer Lag' FROM KafkaOffsetSample SINCE 10 minutes ago"
                                }
                            ],
                            platformOptions: {
                                ignoreTimeRange: false
                            },
                            thresholds: [
                                {
                                    alertSeverity: "CRITICAL",
                                    value: 10
                                }
                            ]
                        }
                    },
                    layout: { column: 1, row: 1, width: 12, height: 3 }
                },
                {
                    title: "Broker Throughput",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(broker.messagesInPerSecond) AS 'Messages In/sec', average(broker.IOInPerSecond) AS 'MB In/sec', average(broker.IOOutPerSecond) AS 'MB Out/sec' FROM KafkaBrokerSample TIMESERIES AUTO"
                                }
                            ],
                            yAxisLeft: {
                                zero: true
                            }
                        }
                    },
                    layout: { column: 1, row: 4, width: 6, height: 3 }
                },
                {
                    title: "Request Performance",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(request.avgTimeFetch) AS 'Fetch', average(request.avgTimeProduce) AS 'Produce', average(request.avgTimeMetadata) AS 'Metadata' FROM KafkaBrokerSample TIMESERIES AUTO"
                                }
                            ],
                            yAxisLeft: {
                                zero: true
                            },
                            units: {
                                unit: "MS"
                            }
                        }
                    },
                    layout: { column: 7, row: 4, width: 6, height: 3 }
                },
                {
                    title: "Replication Health",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT sum(replication.unreplicatedPartitions) AS 'Unreplicated Partitions', average(replication.isrExpandsPerSecond) AS 'ISR Expands/sec', average(replication.isrShrinksPerSecond) AS 'ISR Shrinks/sec' FROM KafkaBrokerSample TIMESERIES AUTO"
                                }
                            ]
                        }
                    },
                    layout: { column: 1, row: 7, width: 6, height: 3 }
                },
                {
                    title: "Failed Requests",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT sum(request.clientFetchesFailedPerSecond) AS 'Failed Fetches', sum(request.produceRequestsFailedPerSecond) AS 'Failed Produces' FROM KafkaBrokerSample TIMESERIES AUTO"
                                }
                            ]
                        }
                    },
                    layout: { column: 7, row: 7, width: 6, height: 3 }
                }
            ]
        },
        {
            name: "Brokers",
            description: "Individual broker performance and health",
            widgets: [
                {
                    title: "Broker Status Table",
                    configuration: {
                        table: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT latest(displayName) AS 'Broker', latest(broker.messagesInPerSecond) AS 'Messages/sec', latest(broker.IOInPerSecond) AS 'MB In/sec', latest(broker.IOOutPerSecond) AS 'MB Out/sec', latest(replication.unreplicatedPartitions) AS 'Unreplicated', latest(request.handlerIdle) AS 'Handler Idle %' FROM KafkaBrokerSample FACET displayName SINCE 10 minutes ago"
                                }
                            ]
                        }
                    },
                    layout: { column: 1, row: 1, width: 12, height: 4 }
                },
                {
                    title: "Per-Broker Throughput",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(broker.messagesInPerSecond) FROM KafkaBrokerSample FACET displayName TIMESERIES AUTO"
                                }
                            ]
                        }
                    },
                    layout: { column: 1, row: 5, width: 6, height: 3 }
                },
                {
                    title: "Per-Broker Request Latency",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(request.avgTimeMetadata) FROM KafkaBrokerSample FACET displayName TIMESERIES AUTO"
                                }
                            ],
                            units: {
                                unit: "MS"
                            }
                        }
                    },
                    layout: { column: 7, row: 5, width: 6, height: 3 }
                }
            ]
        },
        {
            name: "Topics",
            description: "Topic health and partition status",
            widgets: [
                {
                    title: "Topic Health Status",
                    configuration: {
                        table: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT latest(topic) AS 'Topic', latest(topic.underReplicatedPartitions) AS 'Under Replicated', latest(topic.partitionsWithNonPreferredLeader) AS 'Non-Preferred Leaders', latest(topic.respondsToMetadataRequests) AS 'Responds to Metadata' FROM KafkaTopicSample FACET topic SINCE 10 minutes ago LIMIT 50"
                                }
                            ]
                        }
                    },
                    layout: { column: 1, row: 1, width: 12, height: 4 }
                },
                {
                    title: "Topics with Issues",
                    configuration: {
                        billboard: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT uniqueCount(topic) AS 'Topics with Under Replicated Partitions' FROM KafkaTopicSample WHERE topic.underReplicatedPartitions > 0 SINCE 10 minutes ago"
                                },
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT uniqueCount(topic) AS 'Topics with Non-Preferred Leaders' FROM KafkaTopicSample WHERE topic.partitionsWithNonPreferredLeader > 0 SINCE 10 minutes ago"
                                }
                            ],
                            thresholds: [
                                {
                                    alertSeverity: "WARNING",
                                    value: 1
                                }
                            ]
                        }
                    },
                    layout: { column: 1, row: 5, width: 12, height: 3 }
                }
            ]
        },
        {
            name: "Consumer Lag",
            description: "Consumer group lag monitoring",
            widgets: [
                {
                    title: "Consumer Group Lag Summary",
                    configuration: {
                        table: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT latest(consumerGroup) AS 'Consumer Group', latest(topic) AS 'Topic', max(consumer.lag) AS 'Max Partition Lag', sum(consumer.lag) AS 'Total Lag', latest(consumer.offset) AS 'Current Offset' FROM KafkaOffsetSample FACET consumerGroup, topic SINCE 10 minutes ago LIMIT 100"
                                }
                            ]
                        }
                    },
                    layout: { column: 1, row: 1, width: 12, height: 4 }
                },
                {
                    title: "Consumer Lag Trend",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(consumer.lag) FROM KafkaOffsetSample FACET consumerGroup TIMESERIES AUTO"
                                }
                            ]
                        }
                    },
                    layout: { column: 1, row: 5, width: 6, height: 3 }
                },
                {
                    title: "Max Consumer Group Lag",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT max(consumerGroup.maxLag) FROM KafkaOffsetSample FACET consumerGroup TIMESERIES AUTO"
                                }
                            ]
                        }
                    },
                    layout: { column: 7, row: 5, width: 6, height: 3 }
                }
            ]
        },
        {
            name: "Performance",
            description: "Detailed performance metrics and latency analysis",
            widgets: [
                {
                    title: "Request Latency Percentiles",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(request.avgTimeMetadata) AS 'Avg', average(request.Metadata99Percentile) AS 'p99', average(request.Metadata999Percentile) AS 'p999' FROM KafkaBrokerSample TIMESERIES AUTO"
                                }
                            ],
                            units: {
                                unit: "MS"
                            }
                        }
                    },
                    layout: { column: 1, row: 1, width: 6, height: 3 }
                },
                {
                    title: "Handler Utilization",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(request.handlerIdle) AS 'Handler Idle %', 100 - average(request.handlerIdle) AS 'Handler Busy %' FROM KafkaBrokerSample TIMESERIES AUTO"
                                }
                            ],
                            yAxisLeft: {
                                max: 100,
                                min: 0
                            }
                        }
                    },
                    layout: { column: 7, row: 1, width: 6, height: 3 }
                },
                {
                    title: "Request Queue Time",
                    configuration: {
                        line: {
                            queries: [
                                {
                                    accountIds: [parseInt(ACCOUNT_ID)],
                                    query: "SELECT average(request.avgTimeUpdateMetadata) AS 'Update Metadata', average(request.avgTimeMetadata) AS 'Metadata', average(request.avgTimeFetch) AS 'Fetch', average(request.avgTimeProduce) AS 'Produce' FROM KafkaBrokerSample TIMESERIES AUTO"
                                }
                            ],
                            units: {
                                unit: "MS"
                            }
                        }
                    },
                    layout: { column: 1, row: 4, width: 12, height: 3 }
                }
            ]
        }
    ]
};

async function createDashboard() {
    const mutation = `
        mutation CreateDashboard($dashboard: DashboardInput!) {
            dashboardCreate(accountId: ${ACCOUNT_ID}, dashboard: $dashboard) {
                errors {
                    description
                    type
                }
                entityResult {
                    guid
                    name
                    permalink
                }
            }
        }
    `;

    try {
        console.log('🚀 Creating Kafka monitoring dashboard...');
        
        const response = await axios({
            url: 'https://api.newrelic.com/graphql',
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'API-Key': API_KEY
            },
            data: {
                query: mutation,
                variables: {
                    dashboard: dashboardConfig
                }
            }
        });

        if (response.data.errors) {
            console.error('❌ GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
            return;
        }

        const result = response.data.data.dashboardCreate;
        
        if (result.errors && result.errors.length > 0) {
            console.error('❌ Dashboard creation errors:', JSON.stringify(result.errors, null, 2));
            return;
        }

        console.log('✅ Dashboard created successfully!');
        console.log('📊 Dashboard Name:', result.entityResult.name);
        console.log('🔗 Dashboard URL:', result.entityResult.permalink);
        console.log('🆔 Dashboard GUID:', result.entityResult.guid);
        
        // Save dashboard info
        const dashboardInfo = {
            name: result.entityResult.name,
            guid: result.entityResult.guid,
            permalink: result.entityResult.permalink,
            createdAt: new Date().toISOString(),
            config: dashboardConfig
        };
        
        fs.writeFileSync('kafka-dashboard-info.json', JSON.stringify(dashboardInfo, null, 2));
        console.log('💾 Dashboard info saved to kafka-dashboard-info.json');
        
    } catch (error) {
        console.error('❌ Error creating dashboard:', error.message);
        if (error.response) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Run the dashboard creation
createDashboard();