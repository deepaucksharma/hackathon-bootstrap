<a href="https://opensource.newrelic.com/oss-category/#community-plus"><picture><source media="(prefers-color-scheme: dark)" srcset="https://github.com/newrelic/opensource-website/raw/main/src/images/categories/dark/Community_Plus.png"><source media="(prefers-color-scheme: light)" srcset="https://github.com/newrelic/opensource-website/raw/main/src/images/categories/Community_Plus.png"><img alt="New Relic Open Source community plus project banner." src="https://github.com/newrelic/opensource-website/raw/main/src/images/categories/Community_Plus.png"></picture></a>

# New Relic integration for Kafka

The New Relic integration for Kafka captures critical performance metrics and inventory reported by Kafka clusters. Data on Brokers, Topics, Java Producers, and Java Consumers is collected.

Inventory data is obtained mainly from Zookeeper nodes and metrics are collected through JMX.

See our [documentation web site](https://docs.newrelic.com/docs/integrations/host-integrations/host-integrations-list/kafka-monitoring-integration) for more details.

## Requirements

JMX is required to be enabled on the following entities in order to be able to collect metrics:

- Brokers
- Java Producers
- Java Consumers

Information on configuring JMX can be found [here](https://docs.oracle.com/javase/8/docs/technotes/guides/management/agent.html).

## MSK Compatibility Mode

Transform your self-managed Kafka metrics to be compatible with New Relic's AWS MSK Message Queues & Streams UI.

### Quick Start
```bash
export MSK_SHIM_ENABLED=true
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export KAFKA_CLUSTER_NAME=my-cluster
```

See [MSK Shim Documentation](./docs/MSK-SHIM.md) for complete setup and configuration.

## Project Structure

```
├── src/                    # Source code
├── tests/                  # Test files and mocks
├── scripts/               # Utility scripts
│   ├── debug/             # Debugging tools
│   ├── verify/            # Verification scripts
│   └── msk/               # MSK-specific scripts
├── examples/              # Configuration examples
│   ├── configs/           # Sample configurations
│   └── msk/               # MSK examples
├── docs/                  # Documentation
│   ├── msk/               # MSK documentation
│   └── specs/             # Specifications
├── k8s-deploy/            # Kubernetes deployment
└── strimzi-kafka-setup/   # Strimzi Kafka setup
```

## Installation and usage

For installation and usage instructions, see our [documentation web site](https://docs.newrelic.com/docs/integrations/host-integrations/host-integrations-list/kafka-monitoring-integration).

## Compatibility

* Supported OS: No limitations
* Kafka versions: 0.8+

## Building

Golang is required to build the integration. We recommend Golang 1.11 or higher.

After cloning this repository, go to the directory of the Kafka integration and build it:

```bash
$ make
```

The command above executes the tests for the Kafka integration and builds an executable file called `nri-kafka` under the `bin` directory. 

To start the integration, run `nri-kafka`:

```bash
$ ./bin/nri-kafka
```

If you want to know more about usage of `./bin/nri-kafka`, pass the `-help` parameter:

```bash
$ ./bin/nri-kafka -help
```

External dependencies are managed through the [govendor tool](https://github.com/kardianos/govendor). Locking all external dependencies to a specific version (if possible) into the vendor directory is required.

## Testing

To run the tests execute:

```bash
$ make test
```

## Consumer/Producer container image

A container image for testing purposes to create a simple Java consumer/producer exposing JMX metrics,
[kafka-consumer-producer](https://github.com/newrelic/nri-kafka/pkgs/container/kafka-consumer-producer).

The consumer/producer will be launched with the client.id set to the name of the hostname for easier matching when setting the nri-kafka config file.

The container can be launched as a consumer with the command:
```yaml
command: ["consumer","broker:9092","topicA","groupA"]
```
And as a producer:
```yaml
command: ["producer","broker:9092","topicA"]
```

Refer to this example to see how to overwrite the JMX settings if you want to use it (note we set the hostname to not be auto-generated): [docker-compose-example](https://github.com/newrelic/nri-kafka/blob/b75de00b1a2d8045587ef15b90d9f7b6d1670d93/tests/integration/docker-compose.yml#L82).

## Support

Should you need assistance with New Relic products, you are in good hands with several support diagnostic tools and support channels.



> New Relic offers NRDiag, [a client-side diagnostic utility](https://docs.newrelic.com/docs/using-new-relic/cross-product-functions/troubleshooting/new-relic-diagnostics) that automatically detects common problems with New Relic agents. If NRDiag detects a problem, it suggests troubleshooting steps. NRDiag can also automatically attach troubleshooting data to a New Relic Support ticket.

If the issue has been confirmed as a bug or is a Feature request, please file a Github issue.

**Support Channels**

* [New Relic Documentation](https://docs.newrelic.com): Comprehensive guidance for using our platform
* [New Relic Community](https://forum.newrelic.com): The best place to engage in troubleshooting questions
* [New Relic Developer](https://developer.newrelic.com/): Resources for building a custom observability applications
* [New Relic University](https://learn.newrelic.com/): A range of online training for New Relic users of every level
* [New Relic Technical Support](https://support.newrelic.com/) 24/7/365 ticketed support. Read more about our [Technical Support Offerings](https://docs.newrelic.com/docs/licenses/license-information/general-usage-licenses/support-plan).

## Privacy

At New Relic we take your privacy and the security of your information seriously, and are committed to protecting your information. We must emphasize the importance of not sharing personal data in public forums, and ask all users to scrub logs and diagnostic information for sensitive information, whether personal, proprietary, or otherwise.

We define “Personal Data” as any information relating to an identified or identifiable individual, including, for example, your name, phone number, post code or zip code, Device ID, IP address, and email address.

For more information, review [New Relic’s General Data Privacy Notice](https://newrelic.com/termsandconditions/privacy).

## Contribute

We encourage your contributions to improve this project! Keep in mind that when you submit your pull request, you'll need to sign the CLA via the click-through using CLA-Assistant. You only have to sign the CLA one time per project.

If you have any questions, or to execute our corporate CLA (which is required if your contribution is on behalf of a company), drop us an email at opensource@newrelic.com.

**A note about vulnerabilities**

As noted in our [security policy](../../security/policy), New Relic is committed to the privacy and security of our customers and their data. We believe that providing coordinated disclosure by security researchers and engaging with the security community are important means to achieve our security goals.

If you believe you have found a security vulnerability in this project or any of New Relic's products or websites, we welcome and greatly appreciate you reporting it to New Relic through [HackerOne](https://hackerone.com/newrelic).

If you would like to contribute to this project, review [these guidelines](./CONTRIBUTING.md).

To all contributors, we thank you!  Without your contribution, this project would not be what it is today.

## License

nri-kafka is licensed under the [MIT](/LICENSE) License.
