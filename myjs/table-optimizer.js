/**
 * 表格自动优化脚本
 * 功能：
 * 1. 自动检测表格宽度并应用相应的CSS类
 * 2. 为表格添加容器以实现居中和滚动
 * 3. 响应式调整表格样式
 */

(function() {
    'use strict';
    
    // 配置参数
    const CONFIG = {
        mediumTableWidth: 600,   // 中等宽度阈值
        wideTableWidth: 800,     // 宽表格阈值
        extraWideTableWidth: 1000, // 超宽表格阈值
        resizeDelay: 150         // 窗口大小调整防抖延迟
    };
    
    /**
     * 为表格添加容器
     * @param {HTMLElement} table - 表格元素
     */
    function wrapTableWithContainer(table) {
        // 检查是否已经有容器
        if (table.parentElement && table.parentElement.classList.contains('table-container')) {
            return table.parentElement;
        }
        
        // 创建容器
        const container = document.createElement('div');
        container.className = 'table-container';
        
        // 插入容器并移动表格
        table.parentNode.insertBefore(container, table);
        container.appendChild(table);
        
        return container;
    }
    
    /**
     * 获取表格的实际宽度
     * @param {HTMLElement} table - 表格元素
     * @returns {number} 表格宽度
     */
    function getTableWidth(table) {
        // 临时设置表格样式以获取真实宽度
        const originalWidth = table.style.width;
        const originalDisplay = table.style.display;
        
        table.style.width = 'auto';
        table.style.display = 'table';
        
        const width = table.offsetWidth;
        
        // 恢复原始样式
        table.style.width = originalWidth;
        table.style.display = originalDisplay;
        
        return width;
    }
    
    /**
     * 根据表格宽度应用相应的CSS类
     * @param {HTMLElement} table - 表格元素
     */
    function applyTableSizeClass(table) {
        // 移除所有现有的大小类
        table.classList.remove('medium-table', 'wide-table', 'extra-wide-table');
        
        const tableWidth = getTableWidth(table);
        const containerWidth = table.closest('.post-content')?.offsetWidth || window.innerWidth;
        
        // 计算表格相对于容器的宽度比例
        const widthRatio = tableWidth / containerWidth;
        
        // 根据宽度比例和绝对宽度应用类
        if (tableWidth > CONFIG.extraWideTableWidth || widthRatio > 0.95) {
            table.classList.add('extra-wide-table');
        } else if (tableWidth > CONFIG.wideTableWidth || widthRatio > 0.8) {
            table.classList.add('wide-table');
        } else if (tableWidth > CONFIG.mediumTableWidth || widthRatio > 0.6) {
            table.classList.add('medium-table');
        }
        
        // 为短表格设置适当的宽度
        if (widthRatio < 0.6) {
            table.style.width = 'auto';
        } else {
            table.style.width = '100%';
        }
    }
    
    /**
     * 优化单个表格
     * @param {HTMLElement} table - 表格元素
     */
    function optimizeTable(table) {
        // 跳过已经在特殊容器中的表格
        if (table.closest('.responsive-iframe-container') || 
            table.closest('.pdf-iframe-container')) {
            return;
        }
        
        // 为表格添加容器
        const container = wrapTableWithContainer(table);
        
        // 应用大小类
        applyTableSizeClass(table);
        
        // 添加调试信息（开发模式下）
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log(`表格优化: 宽度=${getTableWidth(table)}px, 类=${Array.from(table.classList).join(' ')}`);
        }
    }
    
    /**
     * 优化页面中的所有表格
     */
    function optimizeAllTables() {
        const tables = document.querySelectorAll('.post-content table');
        
        tables.forEach(table => {
            try {
                optimizeTable(table);
            } catch (error) {
                console.warn('表格优化失败:', error, table);
            }
        });
    }
    
    /**
     * 防抖函数
     * @param {Function} func - 要防抖的函数
     * @param {number} delay - 延迟时间
     * @returns {Function} 防抖后的函数
     */
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
    
    /**
     * 窗口大小改变时重新优化表格
     */
    const handleResize = debounce(() => {
        optimizeAllTables();
    }, CONFIG.resizeDelay);
    
    /**
     * 初始化表格优化器
     */
    function init() {
        // DOM加载完成后初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', optimizeAllTables);
        } else {
            optimizeAllTables();
        }
        
        // 监听窗口大小变化
        window.addEventListener('resize', handleResize);
        
        // 监听动态内容加载（如果使用了PJAX或SPA）
        document.addEventListener('pjax:success', optimizeAllTables);
        document.addEventListener('turbo:load', optimizeAllTables);
        
        // MutationObserver监听新添加的表格
        if (window.MutationObserver) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 检查新添加的节点是否包含表格
                            const tables = node.querySelectorAll ? 
                                node.querySelectorAll('.post-content table') : [];
                            
                            if (node.matches && node.matches('.post-content table')) {
                                optimizeTable(node);
                            } else if (tables.length > 0) {
                                tables.forEach(optimizeTable);
                            }
                        }
                    });
                });
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }
    
    // 暴露API供外部调用
    window.TableOptimizer = {
        init: init,
        optimizeAllTables: optimizeAllTables,
        optimizeTable: optimizeTable,
        config: CONFIG
    };
    
    // 自动初始化
    init();
    
})(); 