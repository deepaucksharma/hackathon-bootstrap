/**
 * NerdGraphOnlyBuilder - Dashboard builder that uses ONLY NerdGraph for all operations
 * No local files, no templates, no caching - everything via NerdGraph API
 */

const logger = require('../utils/logger');

class NerdGraphOnlyBuilder {
  constructor(config) {
    this.accountId = config.accountId;
    this.apiKey = config.apiKey;
    this.region = config.region || 'US';
    this.nerdgraphEndpoint = this.region === 'EU' 
      ? 'https://api.eu.newrelic.com/graphql'
      : 'https://api.newrelic.com/graphql';
  }

  /**
   * Execute a NerdGraph query
   */
  async nerdgraphQuery(query, variables = {}) {
    const response = await fetch(this.nerdgraphEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`NerdGraph request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(`NerdGraph errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  /**
   * Discover all available event types and metrics via NerdGraph
   */
  async discoverMetrics(options = {}) {
    logger.info('Discovering metrics via NerdGraph...');
    
    // First, get all event types
    const eventTypesQuery = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SHOW EVENT TYPES") {
              results
            }
          }
        }
      }
    `;

    const eventTypesResult = await this.nerdgraphQuery(eventTypesQuery, { 
      accountId: this.accountId 
    });
    
    const eventTypes = eventTypesResult.actor.account.nrql.results
      .map(r => r.eventType)
      .filter(e => e); // Remove nulls

    // For each event type, discover attributes
    const metrics = {};
    for (const eventType of eventTypes) {
      const attributesQuery = `
        query($accountId: Int!, $query: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $query) {
                results
              }
            }
          }
        }
      `;

      try {
        const result = await this.nerdgraphQuery(attributesQuery, {
          accountId: this.accountId,
          query: `SELECT keyset() FROM ${eventType} LIMIT 1`
        });

        if (result.actor.account.nrql.results.length > 0) {
          metrics[eventType] = result.actor.account.nrql.results[0];
        }
      } catch (error) {
        logger.warn(`Failed to get attributes for ${eventType}:`, error.message);
      }
    }

    return { eventTypes, metrics };
  }

  /**
   * Generate dashboard based on discovered metrics
   */
  async generateDashboard(options = {}) {
    const { name = `Dashboard - ${new Date().toISOString()}` } = options;
    
    // Discover available data
    const discovery = await this.discoverMetrics();
    
    // Build widgets based on discovered metrics
    const widgets = await this.generateWidgets(discovery);
    
    // Create dashboard structure
    const dashboard = {
      name,
      description: 'Generated via NerdGraph',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [{
        name: 'Overview',
        widgets
      }]
    };

    return dashboard;
  }

  /**
   * Generate widgets from discovered metrics
   */
  async generateWidgets(discovery) {
    const widgets = [];
    let row = 0;
    let col = 0;

    // For each event type with metrics
    for (const [eventType, attributes] of Object.entries(discovery.metrics)) {
      // Skip if no attributes
      if (!attributes || Object.keys(attributes).length === 0) continue;

      // Create a summary widget for this event type
      const summaryWidget = {
        title: `${eventType} Overview`,
        visualization: { id: 'viz.billboard' },
        layout: { column: col, row, width: 3, height: 2 },
        configuration: {
          nrqlQueries: [{
            accountId: this.accountId,
            query: `SELECT count(*) FROM ${eventType} SINCE 1 hour ago`
          }]
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: this.accountId,
            query: `SELECT count(*) FROM ${eventType} SINCE 1 hour ago`
          }]
        }
      };
      widgets.push(summaryWidget);

      // Move to next position
      col += 3;
      if (col >= 12) {
        col = 0;
        row += 2;
      }

      // Create metric widgets for numeric attributes
      const numericAttributes = Object.entries(attributes)
        .filter(([key, value]) => typeof value === 'number' && !key.startsWith('nr.'))
        .slice(0, 4); // Limit to 4 metrics per event type

      for (const [attribute] of numericAttributes) {
        const metricWidget = {
          title: `${eventType} - ${attribute}`,
          visualization: { id: 'viz.line' },
          layout: { column: col, row, width: 6, height: 3 },
          configuration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `SELECT average(${attribute}) FROM ${eventType} TIMESERIES AUTO SINCE 1 hour ago`
            }]
          },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `SELECT average(${attribute}) FROM ${eventType} TIMESERIES AUTO SINCE 1 hour ago`
            }]
          }
        };
        widgets.push(metricWidget);

        // Move to next position
        col += 6;
        if (col >= 12) {
          col = 0;
          row += 3;
        }
      }

      // Reset column for next event type
      if (col > 0) {
        col = 0;
        row += 3;
      }
    }

    return widgets;
  }

  /**
   * Create dashboard in New Relic via NerdGraph
   */
  async createDashboard(dashboard) {
    const mutation = `
      mutation($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
          }
          errors {
            description
            type
          }
        }
      }
    `;

    const result = await this.nerdgraphQuery(mutation, {
      accountId: this.accountId,
      dashboard: this.transformDashboardForAPI(dashboard)
    });

    if (result.dashboardCreate.errors?.length > 0) {
      throw new Error(`Dashboard creation failed: ${JSON.stringify(result.dashboardCreate.errors)}`);
    }

    return {
      guid: result.dashboardCreate.entityResult.guid,
      url: `https://one.newrelic.com/dashboards/${result.dashboardCreate.entityResult.guid}`
    };
  }

  /**
   * Get existing dashboards via NerdGraph
   */
  async listDashboards() {
    const query = `
      query($accountId: Int!) {
        actor {
          entitySearch(query: "accountId = ${accountId} AND type = 'DASHBOARD'") {
            results {
              entities {
                guid
                name
                tags {
                  key
                  values
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.nerdgraphQuery(query, { accountId: this.accountId });
    return result.actor.entitySearch.results.entities;
  }

  /**
   * Get dashboard details via NerdGraph
   */
  async getDashboard(guid) {
    const query = `
      query($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            ... on DashboardEntity {
              guid
              name
              description
              permissions
              pages {
                name
                description
                widgets {
                  title
                  visualization {
                    id
                  }
                  layout {
                    column
                    row
                    width
                    height
                  }
                  configuration
                  rawConfiguration
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.nerdgraphQuery(query, { guid });
    return result.actor.entity;
  }

  /**
   * Update existing dashboard via NerdGraph
   */
  async updateDashboard(guid, dashboard) {
    const mutation = `
      mutation($guid: EntityGuid!, $dashboard: DashboardInput!) {
        dashboardUpdate(guid: $guid, dashboard: $dashboard) {
          entityResult {
            guid
          }
          errors {
            description
            type
          }
        }
      }
    `;

    const result = await this.nerdgraphQuery(mutation, {
      guid,
      dashboard: this.transformDashboardForAPI(dashboard)
    });

    if (result.dashboardUpdate.errors?.length > 0) {
      throw new Error(`Dashboard update failed: ${JSON.stringify(result.dashboardUpdate.errors)}`);
    }

    return result.dashboardUpdate.entityResult;
  }

  /**
   * Delete dashboard via NerdGraph
   */
  async deleteDashboard(guid) {
    const mutation = `
      mutation($guid: EntityGuid!) {
        dashboardDelete(guid: $guid) {
          status
          errors {
            description
            type
          }
        }
      }
    `;

    const result = await this.nerdgraphQuery(mutation, { guid });

    if (result.dashboardDelete.errors?.length > 0) {
      throw new Error(`Dashboard deletion failed: ${JSON.stringify(result.dashboardDelete.errors)}`);
    }

    return result.dashboardDelete.status;
  }

  /**
   * Analyze entity relationships via NerdGraph
   */
  async analyzeRelationships(entityType) {
    const query = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SELECT relationships() FROM ${entityType} SINCE 1 day ago LIMIT 100") {
              results
            }
          }
        }
      }
    `;

    try {
      const result = await this.nerdgraphQuery(query, { accountId: this.accountId });
      return result.actor.account.nrql.results;
    } catch (error) {
      logger.warn(`Failed to analyze relationships for ${entityType}:`, error.message);
      return [];
    }
  }

  /**
   * Create alerts via NerdGraph
   */
  async createAlert(condition) {
    const mutation = `
      mutation($accountId: Int!, $condition: NrqlAlertConditionInput!) {
        alertsNrqlConditionCreate(accountId: $accountId, condition: $condition) {
          id
          name
          nrql {
            query
          }
        }
      }
    `;

    const result = await this.nerdgraphQuery(mutation, {
      accountId: this.accountId,
      condition
    });

    return result.alertsNrqlConditionCreate;
  }

  /**
   * Transform dashboard to API format
   */
  transformDashboardForAPI(dashboard) {
    return {
      name: dashboard.name,
      description: dashboard.description,
      permissions: dashboard.permissions,
      pages: dashboard.pages.map(page => ({
        name: page.name,
        description: page.description || '',
        widgets: page.widgets.map(widget => ({
          title: widget.title,
          visualization: widget.visualization,
          layout: widget.layout,
          configuration: widget.configuration,
          rawConfiguration: widget.rawConfiguration
        }))
      }))
    };
  }

  /**
   * Execute arbitrary NRQL via NerdGraph
   */
  async executeNRQL(query) {
    const graphQuery = `
      query($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
              totalResult
              metadata {
                eventTypes
                messages
                facets
              }
            }
          }
        }
      }
    `;

    const result = await this.nerdgraphQuery(graphQuery, {
      accountId: this.accountId,
      query
    });

    return result.actor.account.nrql;
  }
}

module.exports = NerdGraphOnlyBuilder;