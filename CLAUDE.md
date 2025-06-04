# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PRIMARY OBJECTIVE

**CRITICAL MISSION**: Achieve complete Kafka metrics reporting via custom nri-kafka implementation with 90%+ health scores across all metric categories. This is an iterative process requiring persistent effort, continuous validation, and adaptive problem-solving.

## Overview

This is the New Relic Integration for Kafka (nri-kafka), which monitors Kafka clusters by collecting JMX metrics and inventory data. The integration includes a comprehensive MSK shim feature that transforms self-managed Kafka metrics to be compatible with AWS MSK format for the New Relic UI.

## Success Criteria

Before proceeding with ANY task, ensure alignment with these goals:

1. **Metric Coverage**: MSK entity types are REQUIRED (AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample). Standard Kafka metrics (KafkaBrokerSample, KafkaTopicSample, KafkaOffsetSample) are OPTIONAL.
2. **Health Scores**: Achieve 99%+ in all categories (Data Availability, Metric Completeness, Data Freshness, Entity Relationships)
3. **Validation**: Use `verify-kafka-metrics.js` after EVERY change to measure progress
4. **Documentation**: Document every learning, fix, and configuration that works

## CRITICAL LEARNINGS FROM USER

1. **Standard Kafka metrics are NOT a requirement and are optional** - Focus on MSK metrics
2. **nri-kafka MUST work WITH infrastructure agent/bundle** - Do not think of nri-kafka as standalone
3. **Custom nri-kafka binary must replace the one in infrastructure-bundle** - Build custom binary with MSK shim and replace in bundle
4. **Use latest infrastructure-bundle version** - Check Docker Hub for latest version
5. **Infrastructure Setup Requirement**: Need to setup latest infrastructure bundle and replace nri-kafka with custom build nri-kafka with MSK changes. Refer to NewRelic docs for more details.
6. **Metric Completeness Priority**: Metric completeness takes highest priority and needs to be 100% before we focus on rest
7. **Multi-Cluster Configuration**: We have two Kafka clusters now and both need to run independently and are part of our setup

[Rest of the content remains the same as in the previous file]