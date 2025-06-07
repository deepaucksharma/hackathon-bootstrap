/**
 * API Client for executing NRQL queries
 */

const https = require('https');
const { api } = require('./config');

class ApiClient {
    constructor(apiKey, accountId) {
        this.apiKey = apiKey;
        this.accountId = parseInt(accountId);
    }

    /**
     * Execute a NRQL query
     * @param {string} query - NRQL query string
     * @returns {Promise<any>} Query results
     */
    async executeQuery(query) {
        return new Promise((resolve, reject) => {
            const nrql = query.trim().replace(/\s+/g, ' ');
            const graphqlQuery = {
                query: `
                    query($accountId: Int!, $nrqlQuery: Nrql!) {
                        actor {
                            account(id: $accountId) {
                                nrql(query: $nrqlQuery) {
                                    results
                                }
                            }
                        }
                    }
                `,
                variables: {
                    accountId: this.accountId,
                    nrqlQuery: nrql
                }
            };

            const postData = JSON.stringify(graphqlQuery);
            const options = {
                hostname: api.hostname,
                path: api.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'API-Key': this.apiKey,
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: api.timeout
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.errors) {
                            reject(new Error(response.errors[0].message));
                        } else {
                            const results = response.data?.actor?.account?.nrql?.results;
                            resolve(results);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Query timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Execute multiple queries in parallel with rate limiting
     * @param {Array} queries - Array of queries to execute
     * @param {number} concurrency - Maximum concurrent requests
     * @returns {Promise<Array>} Array of results
     */
    async executeQueries(queries, concurrency = 5) {
        const results = [];
        const executing = [];
        
        for (const [index, query] of queries.entries()) {
            const promise = this.executeQuery(query).then(result => {
                results[index] = { success: true, result };
                return index;
            }).catch(error => {
                results[index] = { success: false, error: error.message };
                return index;
            });

            executing.push(promise);

            if (executing.length >= concurrency) {
                await Promise.race(executing).then(completedIndex => {
                    executing.splice(executing.findIndex(p => p === promise), 1);
                });
            }

            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await Promise.all(executing);
        return results;
    }
}

module.exports = ApiClient;