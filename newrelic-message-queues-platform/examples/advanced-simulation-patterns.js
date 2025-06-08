#!/usr/bin/env node

/**
 * Advanced Simulation Patterns Demo
 * 
 * Demonstrates the new v2.0 simulation capabilities:
 * - Business hour patterns
 * - Seasonal variations
 * - Provider-specific behaviors
 * - Anomaly injection
 */

const AdvancedPatternGenerator = require('../simulation/patterns/advanced-patterns');
const chalk = require('chalk');

class SimulationPatternDemo {
  constructor() {
    this.generator = new AdvancedPatternGenerator({
      timezone: 'America/New_York',
      businessHours: { start: 9, end: 17 },
      weekendReduction: 0.3,
      anomalyProbability: 0.05 // 5% for demo
    });
  }

  /**
   * Demo business hour patterns
   */
  demoBusinessHours() {
    console.log(chalk.cyan('\n📊 Business Hour Pattern Demo'));
    console.log(chalk.gray('Shows traffic patterns throughout a typical business day\n'));

    const baseValue = 1000; // Base throughput
    const hours = [];
    
    // Generate 24 hours of data
    for (let hour = 0; hour < 24; hour++) {
      const date = new Date();
      date.setHours(hour, 0, 0, 0);
      
      const value = this.generator.generateValue(baseValue, date.getTime(), ['business']);
      hours.push({ hour, value: Math.round(value) });
    }

    // Display as ASCII chart
    const maxValue = Math.max(...hours.map(h => h.value));
    
    hours.forEach(({ hour, value }) => {
      const barLength = Math.round((value / maxValue) * 50);
      const bar = '█'.repeat(barLength);
      const time = `${hour.toString().padStart(2, '0')}:00`;
      const color = hour >= 9 && hour <= 17 ? chalk.green : chalk.gray;
      
      console.log(`${time} ${color(bar)} ${value}`);
    });
  }

  /**
   * Demo seasonal patterns
   */
  demoSeasonalPatterns() {
    console.log(chalk.cyan('\n📅 Seasonal Pattern Demo'));
    console.log(chalk.gray('Shows traffic variations throughout the year\n'));

    const baseValue = 10000;
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    
    months.forEach((month, index) => {
      const date = new Date(2024, index, 15); // Middle of each month
      const value = this.generator.generateValue(baseValue, date.getTime(), ['seasonal']);
      
      const barLength = Math.round((value / 15000) * 40);
      const bar = '█'.repeat(barLength);
      const color = (index === 10 || index === 11) ? chalk.yellow : 
                   (index === 6 || index === 7) ? chalk.blue : chalk.gray;
      
      console.log(`${month} ${color(bar)} ${Math.round(value)}`);
    });

    console.log(chalk.gray('\nNote: November-December show holiday spikes, July-August show summer slowdown'));
  }

  /**
   * Demo provider-specific patterns
   */
  demoProviderPatterns() {
    console.log(chalk.cyan('\n🔧 Provider-Specific Pattern Demo'));
    console.log(chalk.gray('Shows unique behaviors for different message queue providers\n'));

    // Kafka rebalancing pattern
    console.log(chalk.green('Kafka Rebalancing Events:'));
    const rebalancingSeries = this.generator.generateTimeSeries({
      startTime: Date.now() - 3600000, // Last hour
      endTime: Date.now(),
      interval: 300000, // 5 minutes
      baseValue: 1,
      patterns: [],
      provider: 'kafka',
      metricType: 'rebalancing'
    });

    rebalancingSeries.forEach(point => {
      const time = new Date(point.timestamp).toLocaleTimeString();
      if (point.value > 1) {
        console.log(`  ${time} - ${chalk.red('⚠️  Rebalancing detected!')} (${point.value}x normal)`);
      }
    });

    // RabbitMQ connection churn
    console.log(chalk.green('\nRabbitMQ Connection Churn:'));
    const churnSeries = this.generator.generateTimeSeries({
      startTime: Date.now() - 3600000,
      endTime: Date.now(),
      interval: 300000,
      baseValue: 10,
      patterns: [],
      provider: 'rabbitmq',
      metricType: 'connection.churn'
    });

    const avgChurn = churnSeries.reduce((sum, p) => sum + p.value, 0) / churnSeries.length;
    const maxChurn = Math.max(...churnSeries.map(p => p.value));
    
    console.log(`  Average: ${avgChurn.toFixed(1)} connections/min`);
    console.log(`  Maximum: ${maxChurn.toFixed(1)} connections/min`);
    if (maxChurn > avgChurn * 5) {
      console.log(chalk.red(`  ⚠️  Connection storm detected!`));
    }
  }

  /**
   * Demo anomaly injection
   */
  demoAnomalies() {
    console.log(chalk.cyan('\n🎯 Anomaly Injection Demo'));
    console.log(chalk.gray('Shows different types of anomalies in metric data\n'));

    const series = this.generator.generateTimeSeries({
      startTime: Date.now() - 600000, // Last 10 minutes
      endTime: Date.now(),
      interval: 30000, // 30 seconds
      baseValue: 100,
      patterns: ['anomaly']
    });

    let anomalyCount = 0;
    series.forEach((point, index) => {
      const time = new Date(point.timestamp).toLocaleTimeString();
      const isAnomaly = Math.abs(point.value - 100) > 50;
      
      if (isAnomaly) {
        anomalyCount++;
        const type = point.value > 150 ? 'Spike' : 'Drop';
        const severity = Math.abs(point.value - 100) > 200 ? 'Severe' : 'Moderate';
        const color = severity === 'Severe' ? chalk.red : chalk.yellow;
        
        console.log(`  ${time} - ${color(`${type} Anomaly (${severity})`)} - Value: ${point.value.toFixed(1)}`);
      }
    });

    console.log(`\nTotal anomalies detected: ${anomalyCount} / ${series.length} data points`);
  }

  /**
   * Demo combined patterns
   */
  demoCombinedPatterns() {
    console.log(chalk.cyan('\n🌟 Combined Pattern Demo'));
    console.log(chalk.gray('Shows realistic data with multiple overlapping patterns\n'));

    const series = this.generator.generateTimeSeries({
      startTime: Date.now() - 86400000, // Last 24 hours
      endTime: Date.now(),
      interval: 3600000, // 1 hour
      baseValue: 1000,
      patterns: ['business', 'weekly', 'anomaly'],
      provider: 'kafka',
      metricType: 'consumer.lag'
    });

    console.log('Hourly Kafka Consumer Lag (with business hours + weekly + anomalies):\n');
    
    series.forEach((point, index) => {
      const date = new Date(point.timestamp);
      const time = date.toLocaleString();
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      
      const barLength = Math.round((point.value / 2000) * 30);
      const bar = '█'.repeat(Math.min(barLength, 30));
      
      let color = chalk.gray;
      if (point.value > 1500) color = chalk.yellow;
      if (point.value > 2000) color = chalk.red;
      if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') color = chalk.blue;
      
      console.log(`${dayOfWeek} ${time.padEnd(20)} ${color(bar)} ${point.value.toFixed(0)}`);
    });
  }

  /**
   * Run all demos
   */
  async runAllDemos() {
    console.log(chalk.bold.magenta('\n🚀 Advanced Simulation Patterns - v2.0 Demo\n'));
    console.log('This demo showcases the new realistic data generation capabilities\n');

    this.demoBusinessHours();
    await this.sleep(1000);

    this.demoSeasonalPatterns();
    await this.sleep(1000);

    this.demoProviderPatterns();
    await this.sleep(1000);

    this.demoAnomalies();
    await this.sleep(1000);

    this.demoCombinedPatterns();

    console.log(chalk.bold.green('\n✅ Demo Complete!\n'));
    console.log('These patterns can be applied to any metric in the platform to create');
    console.log('realistic, production-like data for testing and development.\n');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the demo
if (require.main === module) {
  const demo = new SimulationPatternDemo();
  demo.runAllDemos().catch(console.error);
}

module.exports = SimulationPatternDemo;