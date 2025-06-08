/**
 * Browser Verifier
 * 
 * Uses Playwright to perform browser-based verification of dashboards
 * including visual testing, interaction testing, and cross-browser compatibility.
 */

const { chromium, firefox, webkit } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

class BrowserVerifier {
  constructor(config = {}) {
    this.config = {
      headless: config.headless !== false,
      timeout: config.timeout || 30000,
      viewportWidth: config.viewportWidth || 1920,
      viewportHeight: config.viewportHeight || 1080,
      browsers: config.browsers || ['chromium', 'firefox', 'webkit'],
      screenshotDir: config.screenshotDir || './verification-screenshots',
      newRelicUrl: config.newRelicUrl || 'https://one.newrelic.com',
      email: config.email || process.env.NEW_RELIC_EMAIL,
      password: config.password || process.env.NEW_RELIC_PASSWORD,
      ...config
    };

    this.testResults = new Map();
  }

  /**
   * Perform comprehensive browser verification
   */
  async verifyDashboard(dashboardUrl, options = {}) {
    const results = {
      dashboardUrl,
      timestamp: new Date().toISOString(),
      browsers: {},
      crossBrowserIssues: [],
      summary: {}
    };

    console.log(`🌐 Starting browser verification for: ${dashboardUrl}`);

    // Ensure screenshot directory exists
    await this.ensureScreenshotDir();

    // Test in each browser
    for (const browserType of this.config.browsers) {
      console.log(`\n🔍 Testing in ${browserType}...`);
      results.browsers[browserType] = await this.testInBrowser(
        browserType, 
        dashboardUrl, 
        options
      );
    }

    // Analyze cross-browser issues
    results.crossBrowserIssues = this.analyzeCrossBrowserIssues(results.browsers);
    
    // Generate summary
    results.summary = this.generateBrowserSummary(results);

    return results;
  }

  /**
   * Test dashboard in specific browser
   */
  async testInBrowser(browserType, dashboardUrl, options = {}) {
    let browser;
    const testResult = {
      browser: browserType,
      timestamp: new Date().toISOString(),
      tests: {},
      screenshots: [],
      errors: []
    };

    try {
      // Launch browser
      const browserClass = this.getBrowserClass(browserType);
      browser = await browserClass.launch({
        headless: this.config.headless,
        timeout: this.config.timeout
      });

      const context = await browser.newContext({
        viewport: {
          width: this.config.viewportWidth,
          height: this.config.viewportHeight
        },
        locale: 'en-US',
        timezoneId: 'America/New_York'
      });

      const page = await context.newPage();

      // Set up console and error logging
      page.on('console', msg => {
        if (msg.type() === 'error') {
          testResult.errors.push({
            type: 'console',
            text: msg.text(),
            location: msg.location()
          });
        }
      });

      page.on('pageerror', error => {
        testResult.errors.push({
          type: 'page',
          message: error.message,
          stack: error.stack
        });
      });

      // Perform login if credentials provided
      if (this.config.email && this.config.password) {
        await this.loginToNewRelic(page);
      }

      // Navigate to dashboard
      console.log(`  📍 Navigating to dashboard...`);
      await page.goto(dashboardUrl, { 
        waitUntil: 'networkidle',
        timeout: this.config.timeout 
      });

      // Run test suite
      testResult.tests.loadTest = await this.testDashboardLoad(page);
      testResult.tests.widgetTest = await this.testWidgets(page);
      testResult.tests.interactionTest = await this.testInteractions(page);
      testResult.tests.responsiveTest = await this.testResponsiveness(page);
      testResult.tests.performanceTest = await this.testPerformance(page);

      // Take final screenshot
      const screenshotPath = await this.takeScreenshot(page, browserType, 'final');
      testResult.screenshots.push(screenshotPath);

      await context.close();

    } catch (error) {
      console.error(`  ❌ Error testing in ${browserType}:`, error.message);
      testResult.error = error.message;
      testResult.stack = error.stack;
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return testResult;
  }

  /**
   * Test dashboard loading
   */
  async testDashboardLoad(page) {
    const test = {
      name: 'Dashboard Load Test',
      passed: false,
      loadTime: 0,
      details: {}
    };

    try {
      const startTime = Date.now();

      // Wait for dashboard container
      await page.waitForSelector('[data-test="dashboard-container"]', {
        timeout: 10000
      });

      // Wait for at least one widget to load
      await page.waitForSelector('[data-test="widget"]', {
        timeout: 10000
      });

      test.loadTime = Date.now() - startTime;
      test.passed = test.loadTime < 5000; // 5 second threshold

      // Count loaded widgets
      const widgetCount = await page.locator('[data-test="widget"]').count();
      test.details.widgetCount = widgetCount;

      // Check for loading errors
      const errorElements = await page.locator('[data-test="error-message"]').count();
      test.details.errorCount = errorElements;
      
      if (errorElements > 0) {
        test.passed = false;
        test.details.errors = await page.locator('[data-test="error-message"]').allTextContents();
      }

      console.log(`  ✅ Dashboard loaded in ${test.loadTime}ms with ${widgetCount} widgets`);

    } catch (error) {
      test.passed = false;
      test.error = error.message;
      console.log(`  ❌ Dashboard load failed: ${error.message}`);
    }

    return test;
  }

  /**
   * Test widget functionality
   */
  async testWidgets(page) {
    const test = {
      name: 'Widget Functionality Test',
      passed: true,
      widgets: [],
      summary: {}
    };

    try {
      // Get all widgets
      const widgets = await page.locator('[data-test="widget"]').all();
      
      for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        const widgetTest = {
          index: i,
          hasTitle: false,
          hasData: false,
          hasVisualization: false,
          isInteractive: false
        };

        // Check widget title
        const title = await widget.locator('[data-test="widget-title"]').textContent().catch(() => null);
        widgetTest.hasTitle = !!title;
        widgetTest.title = title;

        // Check for data/visualization
        const hasChart = await widget.locator('svg, canvas, table').count() > 0;
        widgetTest.hasVisualization = hasChart;

        // Check for "No data" message
        const noDataMessage = await widget.locator('text=/no data/i').count();
        widgetTest.hasData = hasChart && noDataMessage === 0;

        // Check if widget is interactive (has click handlers)
        const isClickable = await widget.evaluate(el => {
          return el.style.cursor === 'pointer' || 
                 !!el.onclick || 
                 el.getAttribute('role') === 'button';
        });
        widgetTest.isInteractive = isClickable;

        test.widgets.push(widgetTest);
        
        if (!widgetTest.hasTitle || !widgetTest.hasData) {
          test.passed = false;
        }
      }

      // Generate summary
      test.summary = {
        totalWidgets: test.widgets.length,
        withData: test.widgets.filter(w => w.hasData).length,
        withoutData: test.widgets.filter(w => !w.hasData).length,
        interactive: test.widgets.filter(w => w.isInteractive).length
      };

      console.log(`  ✅ Tested ${test.widgets.length} widgets: ${test.summary.withData} have data`);

    } catch (error) {
      test.passed = false;
      test.error = error.message;
      console.log(`  ❌ Widget test failed: ${error.message}`);
    }

    return test;
  }

  /**
   * Test interactions
   */
  async testInteractions(page) {
    const test = {
      name: 'Interaction Test',
      passed: true,
      interactions: []
    };

    try {
      // Test time picker interaction
      const timePickerTest = await this.testTimePicker(page);
      test.interactions.push(timePickerTest);
      if (!timePickerTest.passed) test.passed = false;

      // Test widget drill-down
      const drillDownTest = await this.testWidgetDrillDown(page);
      test.interactions.push(drillDownTest);
      if (!drillDownTest.passed) test.passed = false;

      // Test filter interactions
      const filterTest = await this.testFilters(page);
      test.interactions.push(filterTest);
      if (!filterTest.passed) test.passed = false;

      console.log(`  ✅ Interaction tests: ${test.interactions.filter(t => t.passed).length}/${test.interactions.length} passed`);

    } catch (error) {
      test.passed = false;
      test.error = error.message;
      console.log(`  ❌ Interaction test failed: ${error.message}`);
    }

    return test;
  }

  /**
   * Test responsiveness
   */
  async testResponsiveness(page) {
    const test = {
      name: 'Responsive Design Test',
      passed: true,
      viewports: []
    };

    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 }
    ];

    try {
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(1000); // Wait for layout adjustment

        const viewportTest = {
          ...viewport,
          hasOverflow: false,
          widgetsVisible: true,
          layoutIssues: []
        };

        // Check for horizontal overflow
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        viewportTest.hasOverflow = hasHorizontalScroll;

        // Check if widgets are visible
        const visibleWidgets = await page.locator('[data-test="widget"]:visible').count();
        viewportTest.widgetsVisible = visibleWidgets > 0;
        viewportTest.visibleWidgetCount = visibleWidgets;

        // Take screenshot
        const screenshotPath = await this.takeScreenshot(page, `responsive-${viewport.name}`, viewport.name);
        viewportTest.screenshot = screenshotPath;

        test.viewports.push(viewportTest);
        
        if (viewportTest.hasOverflow || !viewportTest.widgetsVisible) {
          test.passed = false;
        }
      }

      // Reset to original viewport
      await page.setViewportSize({
        width: this.config.viewportWidth,
        height: this.config.viewportHeight
      });

      console.log(`  ✅ Responsive test completed for ${viewports.length} viewports`);

    } catch (error) {
      test.passed = false;
      test.error = error.message;
      console.log(`  ❌ Responsive test failed: ${error.message}`);
    }

    return test;
  }

  /**
   * Test performance metrics
   */
  async testPerformance(page) {
    const test = {
      name: 'Performance Test',
      passed: true,
      metrics: {}
    };

    try {
      // Get performance metrics
      const performanceMetrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        
        return {
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
          firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
          firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
          resourceCount: performance.getEntriesByType('resource').length,
          totalTransferSize: performance.getEntriesByType('resource')
            .reduce((total, resource) => total + (resource.transferSize || 0), 0)
        };
      });

      test.metrics = performanceMetrics;

      // Check against thresholds
      const thresholds = {
        domContentLoaded: 3000,
        firstContentfulPaint: 2000,
        totalTransferSize: 5 * 1024 * 1024 // 5MB
      };

      test.passed = performanceMetrics.domContentLoaded < thresholds.domContentLoaded &&
                    performanceMetrics.firstContentfulPaint < thresholds.firstContentfulPaint &&
                    performanceMetrics.totalTransferSize < thresholds.totalTransferSize;

      console.log(`  ✅ Performance metrics collected: FCP ${performanceMetrics.firstContentfulPaint}ms`);

    } catch (error) {
      test.passed = false;
      test.error = error.message;
      console.log(`  ❌ Performance test failed: ${error.message}`);
    }

    return test;
  }

  /**
   * Test time picker functionality
   */
  async testTimePicker(page) {
    const test = {
      name: 'Time Picker',
      passed: false,
      details: {}
    };

    try {
      // Find time picker
      const timePicker = await page.locator('[data-test="time-picker"]').first();
      
      if (await timePicker.isVisible()) {
        // Click to open
        await timePicker.click();
        
        // Wait for dropdown
        await page.waitForSelector('[data-test="time-picker-dropdown"]', { timeout: 5000 });
        
        // Select a different time range
        await page.click('text="Last 30 minutes"');
        
        // Verify change
        await page.waitForTimeout(2000); // Wait for data refresh
        
        test.passed = true;
        test.details.message = 'Time picker interaction successful';
      } else {
        test.details.message = 'Time picker not found';
      }

    } catch (error) {
      test.details.error = error.message;
    }

    return test;
  }

  /**
   * Test widget drill-down
   */
  async testWidgetDrillDown(page) {
    const test = {
      name: 'Widget Drill-down',
      passed: false,
      details: {}
    };

    try {
      // Find first clickable widget
      const widget = await page.locator('[data-test="widget"]').first();
      
      if (await widget.isVisible()) {
        // Check if widget has drill-down capability
        const isClickable = await widget.evaluate(el => {
          return window.getComputedStyle(el).cursor === 'pointer';
        });

        if (isClickable) {
          await widget.click();
          await page.waitForTimeout(1000);
          
          // Check if drill-down opened (modal, sidebar, or navigation)
          const hasDrillDown = await page.locator('[data-test="drill-down"], [data-test="modal"], [data-test="sidebar"]').count() > 0;
          
          test.passed = hasDrillDown;
          test.details.message = hasDrillDown ? 'Drill-down opened successfully' : 'No drill-down detected';
        } else {
          test.details.message = 'Widget not clickable';
        }
      } else {
        test.details.message = 'No widgets found';
      }

    } catch (error) {
      test.details.error = error.message;
    }

    return test;
  }

  /**
   * Test filters
   */
  async testFilters(page) {
    const test = {
      name: 'Filter Interaction',
      passed: false,
      details: {}
    };

    try {
      // Look for filter controls
      const filters = await page.locator('[data-test="filter"], [data-test="variable-picker"]').all();
      
      if (filters.length > 0) {
        // Test first filter
        const filter = filters[0];
        await filter.click();
        
        // Wait for dropdown/options
        await page.waitForTimeout(500);
        
        // Try to select an option
        const option = await page.locator('[data-test="filter-option"], [role="option"]').first();
        if (await option.isVisible()) {
          await option.click();
          await page.waitForTimeout(2000); // Wait for dashboard update
          
          test.passed = true;
          test.details.message = 'Filter interaction successful';
        } else {
          test.details.message = 'No filter options found';
        }
      } else {
        test.details.message = 'No filters found on dashboard';
        test.passed = true; // Not all dashboards have filters
      }

    } catch (error) {
      test.details.error = error.message;
    }

    return test;
  }

  /**
   * Login to New Relic
   */
  async loginToNewRelic(page) {
    console.log('  🔐 Logging in to New Relic...');
    
    await page.goto(`${this.config.newRelicUrl}/login`);
    await page.fill('input[name="email"]', this.config.email);
    await page.fill('input[name="password"]', this.config.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect after login
    await page.waitForNavigation({ waitUntil: 'networkidle' });
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(page, browser, suffix) {
    const timestamp = Date.now();
    const filename = `dashboard-${browser}-${suffix}-${timestamp}.png`;
    const filepath = path.join(this.config.screenshotDir, filename);
    
    await page.screenshot({ 
      path: filepath,
      fullPage: true 
    });
    
    return filepath;
  }

  /**
   * Analyze cross-browser issues
   */
  analyzeCrossBrowserIssues(browserResults) {
    const issues = [];
    const browsers = Object.keys(browserResults);
    
    // Compare test results across browsers
    const testNames = new Set();
    browsers.forEach(browser => {
      if (browserResults[browser].tests) {
        Object.keys(browserResults[browser].tests).forEach(test => testNames.add(test));
      }
    });

    testNames.forEach(testName => {
      const results = browsers.map(browser => ({
        browser,
        passed: browserResults[browser].tests?.[testName]?.passed || false
      }));

      const passedCount = results.filter(r => r.passed).length;
      
      if (passedCount > 0 && passedCount < browsers.length) {
        issues.push({
          test: testName,
          severity: 'warning',
          browsers: results,
          description: `Test passed in ${passedCount}/${browsers.length} browsers`
        });
      }
    });

    return issues;
  }

  /**
   * Generate browser summary
   */
  generateBrowserSummary(results) {
    const summary = {
      totalBrowsers: Object.keys(results.browsers).length,
      passedBrowsers: 0,
      totalTests: 0,
      passedTests: 0,
      crossBrowserIssues: results.crossBrowserIssues.length
    };

    Object.values(results.browsers).forEach(browserResult => {
      if (browserResult.tests) {
        const tests = Object.values(browserResult.tests);
        const passed = tests.filter(t => t.passed).length;
        
        summary.totalTests += tests.length;
        summary.passedTests += passed;
        
        if (passed === tests.length) {
          summary.passedBrowsers++;
        }
      }
    });

    summary.score = summary.totalTests > 0 
      ? Math.round((summary.passedTests / summary.totalTests) * 100)
      : 0;

    return summary;
  }

  /**
   * Get browser class
   */
  getBrowserClass(browserType) {
    const browserMap = {
      chromium,
      firefox,
      webkit
    };
    
    return browserMap[browserType] || chromium;
  }

  /**
   * Ensure screenshot directory exists
   */
  async ensureScreenshotDir() {
    try {
      await fs.access(this.config.screenshotDir);
    } catch {
      await fs.mkdir(this.config.screenshotDir, { recursive: true });
    }
  }
}

module.exports = BrowserVerifier;