const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+?)[=:](.*)/)
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
}

async function runQuery(query, accountId, apiKey) {
  const graphqlQuery = {
    query: `
      {
        actor {
          account(id: ${accountId}) {
            nrql(query: "${query.replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `
  };
  
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      graphqlQuery,
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': apiKey
        }
      }
    );
    
    return response.data?.data?.actor?.account?.nrql?.results || [];
  } catch (error) {
    console.error('Query error:', error.message);
    return [];
  }
}

async function analyzeCloudIntegrations() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log('🔍 Analyzing Cloud Integrations Collector');
  console.log('========================================\n');
  
  // Find cloud-integrations events
  console.log('1️⃣ Finding cloud-integrations events...');
  const cloudIntQuery = `FROM AwsMskBrokerSample SELECT * WHERE collector.name = 'cloud-integrations' LIMIT 5 SINCE 1 day ago`;
  const cloudIntEvents = await runQuery(cloudIntQuery, accountId, apiKey);
  
  if (cloudIntEvents.length > 0) {
    console.log(`✅ Found ${cloudIntEvents.length} cloud-integrations events\n`);
    
    // Analyze first event
    const event = cloudIntEvents[0];
    console.log('📊 Sample Event Analysis:');
    console.log(`   Entity Name: ${event.entityName}`);
    console.log(`   Entity GUID: ${event.entityGuid}`);
    console.log(`   Provider: ${event.provider}`);
    
    // List ALL fields
    const fields = Object.keys(event).sort();
    console.log(`\n   Total fields: ${fields.length}`);
    
    // Group fields by category
    const providerFields = fields.filter(f => f.startsWith('provider.'));
    const awsFields = fields.filter(f => f.startsWith('aws'));
    const tagFields = fields.filter(f => f.startsWith('tags.'));
    const entityFields = fields.filter(f => f.startsWith('entity'));
    const otherFields = fields.filter(f => 
      !f.startsWith('provider.') && 
      !f.startsWith('aws') && 
      !f.startsWith('tags.') &&
      !f.startsWith('entity')
    );
    
    console.log('\n   Field Categories:');
    console.log(`   - Provider fields: ${providerFields.length}`);
    console.log(`   - AWS fields: ${awsFields.length}`);
    console.log(`   - Tag fields: ${tagFields.length}`);
    console.log(`   - Entity fields: ${entityFields.length}`);
    console.log(`   - Other fields: ${otherFields.length}`);
    
    // Show critical fields
    console.log('\n   Critical Fields:');
    const criticalFields = [
      'provider',
      'collector.name',
      'entityName',
      'entityGuid',
      'providerAccountId',
      'providerAccountName',
      'providerExternalId',
      'awsAccountId',
      'awsRegion',
      'integrationName',
      'integrationVersion',
      'instrumentation.name',
      'instrumentation.provider',
      'instrumentation.source',
      'instrumentation.version'
    ];
    
    criticalFields.forEach(field => {
      const value = event[field];
      console.log(`   ${field}: ${value !== undefined ? JSON.stringify(value) : '❌ MISSING'}`);
    });
    
    // Save full event
    fs.writeFileSync('cloud-integrations-sample.json', JSON.stringify(event, null, 2));
    console.log('\n📁 Full event saved to: cloud-integrations-sample.json');
    
    // Check entity creation for these events
    console.log('\n2️⃣ Checking entity creation for cloud-integrations events...');
    const entityCheckQuery = `FROM Entity SELECT count(*) WHERE name LIKE '%${event.entityName}%' SINCE 1 day ago`;
    const entityCheck = await runQuery(entityCheckQuery, accountId, apiKey);
    
    if (entityCheck.length > 0 && entityCheck[0].count > 0) {
      console.log(`✅ Entity exists for this event\!`);
    } else {
      console.log(`❌ No entity created for this event`);
    }
    
    // Compare with our events
    console.log('\n3️⃣ Comparing with our ui-compatible events...');
    const ourEventsQuery = `FROM AwsMskBrokerSample SELECT * WHERE provider.clusterName LIKE '%ui-compatible%' AND collector.name = 'cloud-integrations' LIMIT 1 SINCE 1 hour ago`;
    const ourEvents = await runQuery(ourEventsQuery, accountId, apiKey);
    
    if (ourEvents.length > 0) {
      const ourEvent = ourEvents[0];
      console.log('\n   Field comparison:');
      
      // Find missing fields
      const missingInOurs = fields.filter(f => ourEvent[f] === undefined);
      if (missingInOurs.length > 0) {
        console.log('\n   ❌ Fields missing in our events:');
        missingInOurs.forEach(field => {
          console.log(`      ${field}: ${JSON.stringify(event[field])}`);
        });
      }
      
      // Check instrumentation fields specifically
      console.log('\n   Instrumentation comparison:');
      const instrFields = ['instrumentation.name', 'instrumentation.provider', 'instrumentation.source', 'instrumentation.version'];
      instrFields.forEach(field => {
        console.log(`      Their ${field}: ${JSON.stringify(event[field])}`);
        console.log(`      Our ${field}: ${JSON.stringify(ourEvent[field])}`);
      });
    }
  } else {
    console.log('❌ No cloud-integrations events found');
  }
}

analyzeCloudIntegrations();