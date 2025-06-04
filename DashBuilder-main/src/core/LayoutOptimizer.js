/**
 * LayoutOptimizer - Intelligent dashboard layout optimization
 * 
 * Arranges widgets for optimal viewing and comprehension
 */

const logger = require('../utils/logger');

class LayoutOptimizer {
  constructor() {
    this.gridColumns = 12;
    this.defaultWidgetHeight = 3;
    this.defaultWidgetWidth = 4;
  }

  /**
   * Optimize widget layout
   */
  optimize(widgets, options = {}) {
    const {
      strategy = 'intelligent',
      columns = this.gridColumns,
      categorization = {},
      priorities = {}
    } = options;

    logger.info(`Optimizing layout with ${strategy} strategy for ${widgets.length} widgets`);

    // Choose optimization strategy
    const strategies = {
      grid: this.gridLayout.bind(this),
      intelligent: this.intelligentLayout.bind(this),
      priority: this.priorityLayout.bind(this),
      grouped: this.groupedLayout.bind(this)
    };

    const layoutStrategy = strategies[strategy] || strategies.grid;
    const optimizedWidgets = layoutStrategy(widgets, { columns, categorization, priorities });

    // Ensure all widgets have valid positions
    return this.fixLayout(optimizedWidgets, columns);
  }

  /**
   * Simple grid layout
   */
  gridLayout(widgets, options) {
    const { columns } = options;
    let currentRow = 0;
    let currentCol = 0;

    return widgets.map(widget => {
      const width = widget.width || this.defaultWidgetWidth;
      const height = widget.height || this.defaultWidgetHeight;

      // Check if widget fits in current row
      if (currentCol + width > columns) {
        currentRow++;
        currentCol = 0;
      }

      const positioned = {
        ...widget,
        width,
        height,
        row: currentRow,
        column: currentCol
      };

      currentCol += width;

      return positioned;
    });
  }

  /**
   * Intelligent layout based on widget characteristics
   */
  intelligentLayout(widgets, options) {
    const { categorization, priorities } = options;
    
    // Group widgets by category
    const categorized = this.categorizeWidgets(widgets, categorization);
    
    // Sort by priority
    const prioritized = this.prioritizeWidgets(categorized, priorities);
    
    // Layout sections
    const sections = [
      { name: 'key-metrics', widgets: prioritized.keyMetrics, layout: 'horizontal' },
      { name: 'golden-signals', widgets: prioritized.goldenSignals, layout: 'grid' },
      { name: 'performance', widgets: prioritized.performance, layout: 'grid' },
      { name: 'errors', widgets: prioritized.errors, layout: 'horizontal' },
      { name: 'capacity', widgets: prioritized.capacity, layout: 'grid' },
      { name: 'other', widgets: prioritized.other, layout: 'grid' }
    ];

    let currentRow = 0;
    const layoutWidgets = [];

    for (const section of sections) {
      if (section.widgets && section.widgets.length > 0) {
        const sectionLayout = this.layoutSection(section, currentRow);
        layoutWidgets.push(...sectionLayout.widgets);
        currentRow = sectionLayout.nextRow;
      }
    }

    return layoutWidgets;
  }

  /**
   * Layout based on priority
   */
  priorityLayout(widgets, options) {
    // Sort by priority (if available in widget metadata)
    const sorted = [...widgets].sort((a, b) => {
      const priorityA = a.priority || 999;
      const priorityB = b.priority || 999;
      return priorityA - priorityB;
    });

    // Use grid layout on sorted widgets
    return this.gridLayout(sorted, options);
  }

  /**
   * Grouped layout - keeps related widgets together
   */
  groupedLayout(widgets, options) {
    const { categorization } = options;
    const groups = {};

    // Group widgets
    widgets.forEach(widget => {
      const group = widget.category || 'default';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(widget);
    });

    // Layout each group
    let currentRow = 0;
    const layoutWidgets = [];

    Object.entries(groups).forEach(([groupName, groupWidgets]) => {
      const groupLayout = this.layoutGroup(groupWidgets, currentRow);
      layoutWidgets.push(...groupLayout.widgets);
      currentRow = groupLayout.nextRow;
    });

    return layoutWidgets;
  }

  /**
   * Categorize widgets based on their characteristics
   */
  categorizeWidgets(widgets, categorization) {
    const categories = {
      keyMetrics: [],
      goldenSignals: [],
      performance: [],
      errors: [],
      capacity: [],
      other: []
    };

    widgets.forEach(widget => {
      if (widget.category === 'golden-signals') {
        categories.goldenSignals.push(widget);
      } else if (widget.visualization.id === 'viz.billboard' && !widget.category) {
        categories.keyMetrics.push(widget);
      } else if (widget.category === 'performance') {
        categories.performance.push(widget);
      } else if (widget.category === 'errors') {
        categories.errors.push(widget);
      } else if (widget.category === 'capacity') {
        categories.capacity.push(widget);
      } else {
        categories.other.push(widget);
      }
    });

    return categories;
  }

  /**
   * Prioritize widgets within categories
   */
  prioritizeWidgets(categorized, priorities) {
    const prioritized = {};

    Object.entries(categorized).forEach(([category, widgets]) => {
      prioritized[category] = widgets.sort((a, b) => {
        // Billboards first
        if (a.visualization.id === 'viz.billboard' && b.visualization.id !== 'viz.billboard') return -1;
        if (b.visualization.id === 'viz.billboard' && a.visualization.id !== 'viz.billboard') return 1;
        
        // Then by title length (shorter = more important)
        return (a.title?.length || 999) - (b.title?.length || 999);
      });
    });

    return prioritized;
  }

  /**
   * Layout a section of widgets
   */
  layoutSection(section, startRow) {
    const { widgets, layout } = section;
    let currentRow = startRow;
    let currentCol = 0;
    const layoutWidgets = [];

    if (layout === 'horizontal') {
      // Single row of small widgets
      widgets.forEach(widget => {
        const width = Math.min(3, this.gridColumns / widgets.length);
        const height = 2;

        if (currentCol + width > this.gridColumns) {
          currentRow++;
          currentCol = 0;
        }

        layoutWidgets.push({
          ...widget,
          width,
          height,
          row: currentRow,
          column: currentCol
        });

        currentCol += width;
      });
      
      currentRow++;
    } else {
      // Grid layout
      widgets.forEach(widget => {
        const width = widget.width || this.getOptimalWidth(widget);
        const height = widget.height || this.getOptimalHeight(widget);

        if (currentCol + width > this.gridColumns) {
          currentRow++;
          currentCol = 0;
        }

        layoutWidgets.push({
          ...widget,
          width,
          height,
          row: currentRow,
          column: currentCol
        });

        currentCol += width;
      });
      
      if (currentCol > 0) currentRow++;
    }

    return { widgets: layoutWidgets, nextRow: currentRow };
  }

  /**
   * Layout a group of related widgets
   */
  layoutGroup(widgets, startRow) {
    // Similar to section layout but ensures group stays together
    return this.layoutSection({ widgets, layout: 'grid' }, startRow);
  }

  /**
   * Get optimal width for a widget based on its type
   */
  getOptimalWidth(widget) {
    const vizType = widget.visualization.id;
    
    // Billboards are smaller
    if (vizType === 'viz.billboard') return 3;
    
    // Tables and lists need more width
    if (vizType === 'viz.table' || vizType === 'viz.list') return 6;
    
    // Line charts benefit from width
    if (vizType === 'viz.line' || vizType === 'viz.area') return 6;
    
    // Default
    return 4;
  }

  /**
   * Get optimal height for a widget based on its type
   */
  getOptimalHeight(widget) {
    const vizType = widget.visualization.id;
    
    // Billboards are shorter
    if (vizType === 'viz.billboard') return 2;
    
    // Tables need height
    if (vizType === 'viz.table') return 4;
    
    // Charts benefit from standard height
    if (vizType === 'viz.line' || vizType === 'viz.area' || vizType === 'viz.bar') return 3;
    
    // Default
    return 3;
  }

  /**
   * Fix layout issues
   */
  fixLayout(widgets, columns) {
    const positioned = [];
    const grid = {};

    widgets.forEach(widget => {
      // Ensure widget has position
      if (widget.row === undefined || widget.column === undefined) {
        logger.warn('Widget missing position, using auto-placement', { title: widget.title });
        // Find next available position
        const position = this.findNextAvailablePosition(grid, widget.width || 4, columns);
        widget.row = position.row;
        widget.column = position.column;
      }

      // Ensure within bounds
      if (widget.column + widget.width > columns) {
        widget.width = columns - widget.column;
      }

      // Mark grid spaces as occupied
      for (let r = widget.row; r < widget.row + widget.height; r++) {
        for (let c = widget.column; c < widget.column + widget.width; c++) {
          const key = `${r},${c}`;
          grid[key] = true;
        }
      }

      // Add rawConfiguration for New Relic
      widget.rawConfiguration = {
        nrqlQueries: widget.configuration.nrqlQueries,
        facet: { showOtherSeries: false },
        platformOptions: {
          ignoreTimeRange: false
        }
      };

      positioned.push(widget);
    });

    return positioned;
  }

  /**
   * Find next available position in grid
   */
  findNextAvailablePosition(grid, width, columns) {
    let row = 0;
    let found = false;

    while (!found) {
      for (let col = 0; col <= columns - width; col++) {
        let available = true;
        
        // Check if space is available
        for (let c = col; c < col + width; c++) {
          if (grid[`${row},${c}`]) {
            available = false;
            break;
          }
        }

        if (available) {
          return { row, column: col };
        }
      }
      row++;
    }
  }
}

module.exports = LayoutOptimizer;