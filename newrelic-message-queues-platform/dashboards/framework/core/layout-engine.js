/**
 * Layout Engine
 * 
 * Generic layout optimization and responsive design for dashboard widgets.
 * Domain-agnostic layout logic that works with any widget configuration.
 */

class LayoutEngine {
  constructor(options = {}) {
    this.options = {
      gridColumns: options.gridColumns || 12,
      minWidgetWidth: options.minWidgetWidth || 3,
      minWidgetHeight: options.minWidgetHeight || 3,
      maxWidgetWidth: options.maxWidgetWidth || 12,
      maxWidgetHeight: options.maxWidgetHeight || 8,
      gapSize: options.gapSize || 1,
      responsive: options.responsive !== false,
      ...options
    };
  }

  /**
   * Optimize layout for widgets
   */
  optimizeLayout(widgets, layoutOptions = {}) {
    const strategy = layoutOptions.layoutPreference || 'balanced';
    const groupBy = layoutOptions.groupBy || 'section';

    let optimizedWidgets;

    // Apply layout strategy
    switch (strategy) {
      case 'compact':
        optimizedWidgets = this.applyCompactLayout(widgets);
        break;
      case 'spacious':
        optimizedWidgets = this.applySpaciousLayout(widgets);
        break;
      case 'performance':
        optimizedWidgets = this.applyPerformanceLayout(widgets);
        break;
      case 'balanced':
      default:
        optimizedWidgets = this.applyBalancedLayout(widgets);
        break;
    }

    // Apply responsive design if enabled
    if (this.options.responsive) {
      optimizedWidgets = this.applyResponsiveDesign(optimizedWidgets);
    }

    // Group widgets if specified
    if (groupBy && groupBy !== 'none') {
      optimizedWidgets = this.applyGrouping(optimizedWidgets, groupBy);
    }

    return {
      widgets: optimizedWidgets,
      metadata: {
        strategy,
        groupBy,
        totalWidgets: optimizedWidgets.length,
        gridColumns: this.options.gridColumns,
        optimizedAt: new Date()
      }
    };
  }

  /**
   * Apply balanced layout strategy
   */
  applyBalancedLayout(widgets) {
    let currentRow = 1;
    let currentColumn = 1;
    const rowHeights = new Map();

    return widgets.map(widget => {
      const layout = { ...widget.layout };

      // Ensure minimum dimensions
      layout.width = Math.max(layout.width || 6, this.options.minWidgetWidth);
      layout.height = Math.max(layout.height || 3, this.options.minWidgetHeight);
      
      // Respect maximum dimensions
      layout.width = Math.min(layout.width, this.options.maxWidgetWidth);
      layout.height = Math.min(layout.height, this.options.maxWidgetHeight);

      // Position widget if not explicitly positioned
      if (!layout.row || !layout.column) {
        // Check if widget fits in current row
        if (currentColumn + layout.width - 1 > this.options.gridColumns) {
          // Move to next row
          currentRow += Math.max(...Array.from(rowHeights.values()).filter(h => h >= currentRow)) || 0;
          currentColumn = 1;
          rowHeights.clear();
        }

        layout.column = currentColumn;
        layout.row = currentRow;
        
        // Track row height
        const widgetEndRow = currentRow + layout.height - 1;
        rowHeights.set(currentColumn, widgetEndRow);
        
        currentColumn += layout.width;
      }

      return {
        ...widget,
        layout
      };
    });
  }

  /**
   * Apply compact layout strategy
   */
  applyCompactLayout(widgets) {
    return widgets.map(widget => {
      const layout = { ...widget.layout };
      
      // Favor smaller widgets in compact mode
      layout.width = Math.min(layout.width || 4, 6);
      layout.height = Math.min(layout.height || 3, 4);
      
      return {
        ...widget,
        layout
      };
    });
  }

  /**
   * Apply spacious layout strategy
   */
  applySpaciousLayout(widgets) {
    return widgets.map(widget => {
      const layout = { ...widget.layout };
      
      // Favor larger widgets in spacious mode
      layout.width = Math.max(layout.width || 6, 8);
      layout.height = Math.max(layout.height || 3, 4);
      
      return {
        ...widget,
        layout
      };
    });
  }

  /**
   * Apply performance-optimized layout
   */
  applyPerformanceLayout(widgets) {
    // Performance mode prioritizes fewer, larger widgets
    return widgets.map(widget => {
      const layout = { ...widget.layout };
      
      // Optimize for performance by reducing widget density
      if (widget.type === 'table' || widget.type === 'line') {
        layout.width = Math.max(layout.width || 8, 8);
        layout.height = Math.max(layout.height || 4, 4);
      } else {
        layout.width = Math.max(layout.width || 6, 6);
        layout.height = Math.max(layout.height || 3, 3);
      }
      
      return {
        ...widget,
        layout
      };
    });
  }

  /**
   * Apply responsive design patterns
   */
  applyResponsiveDesign(widgets) {
    return widgets.map(widget => {
      const layout = { ...widget.layout };
      
      // Add responsive metadata
      layout.responsive = {
        mobile: this.getMobileLayout(layout),
        tablet: this.getTabletLayout(layout),
        desktop: layout
      };
      
      return {
        ...widget,
        layout
      };
    });
  }

  /**
   * Get mobile-optimized layout
   */
  getMobileLayout(layout) {
    return {
      ...layout,
      width: Math.min(layout.width, 12), // Full width on mobile
      height: Math.max(layout.height, 4)  // Ensure readability
    };
  }

  /**
   * Get tablet-optimized layout
   */
  getTabletLayout(layout) {
    return {
      ...layout,
      width: Math.min(layout.width, 8),   // Max 8 columns on tablet
      height: layout.height
    };
  }

  /**
   * Apply grouping to widgets
   */
  applyGrouping(widgets, groupBy) {
    if (groupBy === 'section') {
      return this.groupWidgetsBySection(widgets);
    } else if (groupBy === 'type') {
      return this.groupWidgetsByType(widgets);
    }
    
    return widgets;
  }

  /**
   * Group widgets by section
   */
  groupWidgetsBySection(widgets) {
    const sections = new Map();
    let sectionStartRow = 1;
    
    // Group widgets by section
    widgets.forEach(widget => {
      const section = widget.section || 'Main';
      if (!sections.has(section)) {
        sections.set(section, []);
      }
      sections.get(section).push(widget);
    });
    
    // Reposition widgets within sections
    const groupedWidgets = [];
    
    sections.forEach((sectionWidgets, sectionName) => {
      let sectionColumn = 1;
      let sectionRow = sectionStartRow;
      let sectionMaxHeight = 0;
      
      sectionWidgets.forEach(widget => {
        const layout = { ...widget.layout };
        
        // Position within section
        if (sectionColumn + layout.width - 1 > this.options.gridColumns) {
          sectionRow += sectionMaxHeight + this.options.gapSize;
          sectionColumn = 1;
          sectionMaxHeight = 0;
        }
        
        layout.column = sectionColumn;
        layout.row = sectionRow;
        
        sectionMaxHeight = Math.max(sectionMaxHeight, layout.height);
        sectionColumn += layout.width;
        
        groupedWidgets.push({
          ...widget,
          layout,
          section: sectionName
        });
      });
      
      sectionStartRow = sectionRow + sectionMaxHeight + (this.options.gapSize * 2);
    });
    
    return groupedWidgets;
  }

  /**
   * Group widgets by type
   */
  groupWidgetsByType(widgets) {
    // Sort widgets by type for consistent grouping
    const typeOrder = ['billboard', 'line', 'area', 'bar', 'pie', 'table', 'histogram'];
    
    return widgets.sort((a, b) => {
      const aIndex = typeOrder.indexOf(a.type) !== -1 ? typeOrder.indexOf(a.type) : 999;
      const bIndex = typeOrder.indexOf(b.type) !== -1 ? typeOrder.indexOf(b.type) : 999;
      return aIndex - bIndex;
    });
  }

  /**
   * Validate layout configuration
   */
  validateLayout(widgets) {
    const errors = [];
    
    widgets.forEach((widget, index) => {
      const layout = widget.layout || {};
      
      // Validate dimensions
      if (layout.width && (layout.width < this.options.minWidgetWidth || layout.width > this.options.maxWidgetWidth)) {
        errors.push(`Widget ${index + 1}: width ${layout.width} is outside allowed range`);
      }
      
      if (layout.height && (layout.height < this.options.minWidgetHeight || layout.height > this.options.maxWidgetHeight)) {
        errors.push(`Widget ${index + 1}: height ${layout.height} is outside allowed range`);
      }
      
      // Validate positioning
      if (layout.column && layout.width && (layout.column + layout.width - 1 > this.options.gridColumns)) {
        errors.push(`Widget ${index + 1}: extends beyond grid width`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate layout statistics
   */
  calculateLayoutStats(widgets) {
    const stats = {
      totalWidgets: widgets.length,
      averageWidth: 0,
      averageHeight: 0,
      gridUtilization: 0,
      widgetTypes: new Map(),
      sections: new Set()
    };
    
    let totalWidth = 0;
    let totalHeight = 0;
    let maxRow = 0;
    
    widgets.forEach(widget => {
      const layout = widget.layout || {};
      
      totalWidth += layout.width || 6;
      totalHeight += layout.height || 3;
      maxRow = Math.max(maxRow, (layout.row || 1) + (layout.height || 3) - 1);
      
      // Count widget types
      const type = widget.type || 'unknown';
      stats.widgetTypes.set(type, (stats.widgetTypes.get(type) || 0) + 1);
      
      // Track sections
      if (widget.section) {
        stats.sections.add(widget.section);
      }
    });
    
    stats.averageWidth = totalWidth / widgets.length;
    stats.averageHeight = totalHeight / widgets.length;
    stats.gridUtilization = (totalWidth / (this.options.gridColumns * maxRow)) * 100;
    
    return stats;
  }
}

module.exports = LayoutEngine;