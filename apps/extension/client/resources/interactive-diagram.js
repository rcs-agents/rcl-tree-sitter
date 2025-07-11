// RCL Interactive Diagram JavaScript
// This will be enhanced with Sprotty integration in the next iteration

(function() {
    'use strict';

    // Get VS Code API
    const vscode = acquireVsCodeApi();
    
    // State management
    let currentState = {
        flows: {},
        activeFlow: null,
        messages: {},
        agent: {},
        selectedNodes: [],
        selectedEdges: [],
        editMode: 'select', // 'select', 'add-node', 'connect'
        connectionStart: null,
        undoStack: [],
        redoStack: [],
        clipboard: null,
        showSettings: false
    };

    // DOM elements
    let elements = {};

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeElements();
        setupEventListeners();
        setupMessageHandlers();
        setupDragAndDrop();
        
        // Initialize basic diagram (will be replaced with Sprotty)
        initializeBasicDiagram();
        
        // Notify extension that webview is ready
        vscode.postMessage({ type: 'ready' });
    });

    function initializeElements() {
        elements = {
            // Toolbar
            saveBtn: document.getElementById('saveBtn'),
            undoBtn: document.getElementById('undoBtn'),
            redoBtn: document.getElementById('redoBtn'),
            flowSelect: document.getElementById('flowSelect'),
            addNodeBtn: document.getElementById('addNodeBtn'),
            connectBtn: document.getElementById('connectBtn'),
            deleteBtn: document.getElementById('deleteBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            
            // Sidebar
            propertiesContent: document.getElementById('propertiesContent'),
            
            // Diagram
            sprottyContainer: document.getElementById('sprotty-container')
        };
    }

    function setupEventListeners() {
        // Toolbar buttons
        elements.saveBtn.addEventListener('click', () => {
            saveChanges();
        });

        elements.undoBtn.addEventListener('click', () => {
            performUndo();
        });

        elements.redoBtn.addEventListener('click', () => {
            performRedo();
        });

        elements.flowSelect.addEventListener('change', (e) => {
            const flowId = e.target.value;
            setActiveFlow(flowId);
        });

        elements.addNodeBtn.addEventListener('click', () => {
            toggleEditMode('add-node');
        });

        elements.connectBtn.addEventListener('click', () => {
            toggleEditMode('connect');
        });

        elements.deleteBtn.addEventListener('click', () => {
            deleteSelection();
        });

        elements.settingsBtn.addEventListener('click', () => {
            toggleSettings();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                deleteSelection();
            } else if (e.key === 'Escape') {
                clearSelection();
                setEditMode('select');
            } else if (e.ctrlKey || e.metaKey) {
                if (e.key === 's') {
                    e.preventDefault();
                    saveChanges();
                } else if (e.key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        performRedo();
                    } else {
                        performUndo();
                    }
                } else if (e.key === 'y') {
                    e.preventDefault();
                    performRedo();
                } else if (e.key === 'a') {
                    e.preventDefault();
                    selectAll();
                }
            }
        });
    }

    function setupMessageHandlers() {
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'updateModel':
                    handleModelUpdate(message.data);
                    break;
                case 'setActiveFlow':
                    setActiveFlow(message.data.flowId);
                    break;
                default:
                    console.log('Unknown message type:', message.type);
            }
        });
    }

    function setupDragAndDrop() {
        const paletteItems = document.querySelectorAll('.palette-item');
        
        paletteItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const nodeType = item.dataset.type;
                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'node', nodeType }));
                item.classList.add('dragging');
            });
            
            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
            });
            
            // Make items draggable
            item.draggable = true;
        });

        // Set up drop zone
        elements.sprottyContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.sprottyContainer.classList.add('drop-zone');
        });

        elements.sprottyContainer.addEventListener('dragleave', (e) => {
            if (!elements.sprottyContainer.contains(e.relatedTarget)) {
                elements.sprottyContainer.classList.remove('drop-zone');
            }
        });

        elements.sprottyContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            elements.sprottyContainer.classList.remove('drop-zone');
            
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (data.type === 'node') {
                    createNodeAtPosition(data.nodeType, e.offsetX, e.offsetY);
                }
            } catch (error) {
                console.error('Error handling drop:', error);
            }
        });
    }

    function initializeBasicDiagram() {
        // Basic SVG-based diagram implementation
        // This will be replaced with Sprotty in the next iteration
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.background = 'var(--vscode-background)';
        
        // Add arrow marker definition
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrow');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto');
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
        path.setAttribute('fill', '#666');
        
        marker.appendChild(path);
        defs.appendChild(marker);
        svg.appendChild(defs);
        
        // Clear container and add SVG
        elements.sprottyContainer.innerHTML = '';
        elements.sprottyContainer.appendChild(svg);
        
        currentState.svg = svg;
    }

    function handleModelUpdate(data) {
        console.log('handleModelUpdate called with:', {
            flows: Object.keys(data.flows || {}),
            activeFlow: data.activeFlow,
            messages: Object.keys(data.messages || {}),
            agent: data.agent?.name
        });
        
        currentState = { ...currentState, ...data };
        
        updateFlowSelect();
        renderDiagram();
        updatePropertiesPanel();
    }

    function updateFlowSelect() {
        const flowIds = Object.keys(currentState.flows || {});
        
        // Clear existing options (except first)
        while (elements.flowSelect.children.length > 1) {
            elements.flowSelect.removeChild(elements.flowSelect.lastChild);
        }
        
        // Add flow options
        flowIds.forEach(flowId => {
            const option = document.createElement('option');
            option.value = flowId;
            option.textContent = flowId;
            elements.flowSelect.appendChild(option);
        });
        
        // Set selected flow
        if (currentState.activeFlow && flowIds.includes(currentState.activeFlow)) {
            elements.flowSelect.value = currentState.activeFlow;
        } else if (flowIds.length > 0) {
            currentState.activeFlow = flowIds[0];
            elements.flowSelect.value = currentState.activeFlow;
        }
    }

    function renderDiagram() {
        console.log('renderDiagram called:', {
            hasSvg: !!currentState.svg,
            activeFlow: currentState.activeFlow,
            flowExists: currentState.activeFlow && !!currentState.flows[currentState.activeFlow],
            availableFlows: Object.keys(currentState.flows || {})
        });
        
        if (!currentState.svg || !currentState.activeFlow || !currentState.flows[currentState.activeFlow]) {
            console.log('Skipping render: missing requirements');
            return;
        }

        const flow = currentState.flows[currentState.activeFlow];
        const svg = currentState.svg;
        
        console.log(`Rendering flow "${currentState.activeFlow}" with ${flow.nodes?.length || 0} nodes and ${flow.edges?.length || 0} edges`);
        
        // Clear existing content (except defs)
        const defs = svg.querySelector('defs');
        svg.innerHTML = '';
        if (defs) {
            svg.appendChild(defs);
        }

        // Render nodes
        flow.nodes.forEach(node => {
            renderNode(svg, node);
        });

        // Render edges
        flow.edges.forEach(edge => {
            renderEdge(svg, edge, flow.nodes);
        });
    }

    function renderNode(svg, node) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'diagram-node');
        g.setAttribute('data-node-id', node.id);
        g.setAttribute('transform', `translate(${node.position.x}, ${node.position.y})`);
        
        // Node shape based on type
        let shape;
        let width = 120;
        let height = 40;
        
        if (node.type === 'start' || node.type === 'end') {
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            shape.setAttribute('cx', width / 2);
            shape.setAttribute('cy', height / 2);
            shape.setAttribute('rx', width / 2);
            shape.setAttribute('ry', height / 2);
        } else {
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            shape.setAttribute('width', width);
            shape.setAttribute('height', height);
            shape.setAttribute('rx', 8);
            shape.setAttribute('ry', 8);
        }
        
        // Apply styles based on node type
        let fillColor = '#2196F3';
        if (node.type === 'start') fillColor = '#4CAF50';
        else if (node.type === 'end') fillColor = '#f44336';
        else if (node.type === 'rich_card') fillColor = '#FF9800';
        
        shape.setAttribute('fill', fillColor);
        shape.setAttribute('stroke', '#333');
        shape.setAttribute('stroke-width', '2');
        shape.style.cursor = 'pointer';
        
        // Node label (remove quotes and enable editing)
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', width / 2);
        text.setAttribute('y', height / 2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-family', 'var(--vscode-font-family)');
        text.setAttribute('font-size', '12');
        text.setAttribute('font-weight', '500');
        text.style.pointerEvents = 'all';
        text.style.cursor = 'text';
        text.setAttribute('data-node-id', node.id);
        
        // Clean text display (remove quotes)
        let displayText = node.data?.messageData?.text || node.data?.label || node.id;
        if (displayText.startsWith('"') && displayText.endsWith('"')) {
            displayText = displayText.slice(1, -1);
        }
        text.textContent = displayText;
        
        g.appendChild(shape);
        g.appendChild(text);
        
        // Add event listeners
        g.addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (currentState.editMode === 'connect') {
                handleConnectionClick(node.id);
            } else {
                selectNode(node.id);
            }
        });
        
        g.addEventListener('mousedown', (e) => {
            if (e.button === 0 && currentState.editMode === 'select') { // Left mouse button
                startNodeDrag(node.id, e);
            }
        });
        
        g.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            editNodeInline(node.id, text);
        });
        
        // Add text editing capability
        text.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            editNodeInline(node.id, text);
        });
        
        svg.appendChild(g);
        
        // Add hover effects
        g.addEventListener('mouseenter', () => {
            g.classList.add('hover');
            shape.style.filter = 'url(#dropshadow) brightness(1.1)';
        });
        
        g.addEventListener('mouseleave', () => {
            g.classList.remove('hover');
            shape.style.filter = 'url(#dropshadow)';
        });
    }
    
    // RCL Node Renderers
    function getRCLNodeRenderer(type) {
        const renderers = {
            start: {
                render: (node) => {
                    const width = 120;
                    const height = 50;
                    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                    shape.setAttribute('cx', width / 2);
                    shape.setAttribute('cy', height / 2);
                    shape.setAttribute('rx', width / 2);
                    shape.setAttribute('ry', height / 2);
                    shape.setAttribute('fill', 'var(--vscode-statusBarItem-remoteBackground, #16825D)');
                    shape.setAttribute('stroke', 'var(--vscode-statusBarItem-remoteForeground, #ffffff)');
                    shape.setAttribute('stroke-width', '2');
                    return { shape, width, height };
                }
            },
            message: {
                render: (node) => {
                    const width = 140;
                    const height = 60;
                    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    shape.setAttribute('width', width);
                    shape.setAttribute('height', height);
                    shape.setAttribute('rx', 8);
                    shape.setAttribute('ry', 8);
                    shape.setAttribute('fill', 'var(--vscode-button-background, #0e639c)');
                    shape.setAttribute('stroke', 'var(--vscode-button-foreground, #ffffff)');
                    shape.setAttribute('stroke-width', '2');
                    return { shape, width, height };
                }
            },
            rich_card: {
                render: (node) => {
                    const width = 160;
                    const height = 80;
                    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    shape.setAttribute('width', width);
                    shape.setAttribute('height', height);
                    shape.setAttribute('rx', 12);
                    shape.setAttribute('ry', 12);
                    shape.setAttribute('fill', 'var(--vscode-statusBarItem-warningBackground, #ff9800)');
                    shape.setAttribute('stroke', 'var(--vscode-statusBarItem-warningForeground, #ffffff)');
                    shape.setAttribute('stroke-width', '2');
                    return { shape, width, height };
                }
            },
            end: {
                render: (node) => {
                    const width = 120;
                    const height = 50;
                    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                    shape.setAttribute('cx', width / 2);
                    shape.setAttribute('cy', height / 2);
                    shape.setAttribute('rx', width / 2);
                    shape.setAttribute('ry', height / 2);
                    shape.setAttribute('fill', 'var(--vscode-statusBarItem-errorBackground, #f44336)');
                    shape.setAttribute('stroke', 'var(--vscode-statusBarItem-errorForeground, #ffffff)');
                    shape.setAttribute('stroke-width', '2');
                    return { shape, width, height };
                }
            }
        };
        
        return renderers[type] || renderers.message;
    }
    
    function createNodeLabel(node, width, height) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'node-label-group');
        
        // Main label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', width / 2);
        text.setAttribute('y', height / 2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', 'var(--vscode-editor-background, #ffffff)');
        text.setAttribute('font-family', 'var(--vscode-font-family)');
        text.setAttribute('font-size', '13');
        text.setAttribute('font-weight', '500');
        text.style.pointerEvents = 'all';
        text.style.cursor = 'text';
        text.setAttribute('data-node-id', node.id);
        
        // Extract and clean text
        let displayText = extractNodeDisplayText(node);
        text.textContent = displayText;
        
        // Add type label for non-message nodes
        if (node.type !== 'message' && node.type !== 'rich_card') {
            const typeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            typeLabel.setAttribute('x', width / 2);
            typeLabel.setAttribute('y', height - 5);
            typeLabel.setAttribute('text-anchor', 'middle');
            typeLabel.setAttribute('font-size', '10');
            typeLabel.setAttribute('fill', 'var(--vscode-descriptionForeground, #cccccc)');
            typeLabel.setAttribute('font-family', 'var(--vscode-font-family)');
            typeLabel.textContent = node.type.toUpperCase();
            g.appendChild(typeLabel);
        }
        
        g.appendChild(text);
        return g;
    }
    
    function extractNodeDisplayText(node) {
        let text = '';
        
        if (node.data?.messageData?.contentMessage?.text) {
            text = node.data.messageData.contentMessage.text;
        } else if (node.data?.messageData?.text) {
            text = node.data.messageData.text;
        } else if (node.data?.label) {
            text = node.data.label;
        } else {
            text = node.id;
        }
        
        // Clean quotes
        if (text.startsWith('"') && text.endsWith('"')) {
            text = text.slice(1, -1);
        }
        
        // Truncate if too long
        if (text.length > 20) {
            text = text.substring(0, 17) + '...';
        }
        
        return text;
    }
    
    function createSuggestionIndicator(nodeWidth, nodeHeight) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'suggestion-indicator');
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', nodeWidth - 10);
        circle.setAttribute('cy', nodeHeight - 10);
        circle.setAttribute('r', 6);
        circle.setAttribute('fill', 'var(--vscode-badge-background, #007acc)');
        circle.setAttribute('stroke', 'var(--vscode-badge-foreground, #ffffff)');
        circle.setAttribute('stroke-width', '1');
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', nodeWidth - 10);
        text.setAttribute('y', nodeHeight - 7);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '8');
        text.setAttribute('fill', 'var(--vscode-badge-foreground, #ffffff)');
        text.textContent = 'S';
        
        g.appendChild(circle);
        g.appendChild(text);
        return g;
    }
    
    function createRichCardIndicator(nodeWidth, nodeHeight) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'richcard-indicator');
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', 5);
        rect.setAttribute('y', 5);
        rect.setAttribute('width', 16);
        rect.setAttribute('height', 12);
        rect.setAttribute('rx', 2);
        rect.setAttribute('fill', 'var(--vscode-minimap-findMatchHighlight, #ffd700)');
        rect.setAttribute('stroke', 'var(--vscode-editor-foreground, #ffffff)');
        rect.setAttribute('stroke-width', '1');
        
        g.appendChild(rect);
        return g;
    }

    function renderEdge(svg, edge, nodes) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (!sourceNode || !targetNode) {
            return;
        }
        
        // Calculate attachment points on box borders
        const sourceCenter = {
            x: sourceNode.position.x + 60,
            y: sourceNode.position.y + 20
        };
        const targetCenter = {
            x: targetNode.position.x + 60,
            y: targetNode.position.y + 20
        };
        
        // Calculate direction vector
        const dx = targetCenter.x - sourceCenter.x;
        const dy = targetCenter.y - sourceCenter.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return;
        
        // Normalize direction
        const unitX = dx / length;
        const unitY = dy / length;
        
        // Box dimensions
        const boxWidth = 120;
        const boxHeight = 40;
        const boxRadius = 8;
        
        // Calculate edge attachment points
        let sourceX, sourceY, targetX, targetY;
        
        // Source attachment point (exit from box border)
        if (Math.abs(unitX) > Math.abs(unitY)) {
            // Horizontal direction dominant
            sourceX = sourceCenter.x + (unitX > 0 ? boxWidth/2 : -boxWidth/2);
            sourceY = sourceCenter.y + (unitY * boxWidth/2 / Math.abs(unitX));
        } else {
            // Vertical direction dominant
            sourceX = sourceCenter.x + (unitX * boxHeight/2 / Math.abs(unitY));
            sourceY = sourceCenter.y + (unitY > 0 ? boxHeight/2 : -boxHeight/2);
        }
        
        // Target attachment point (enter at box border)
        if (Math.abs(unitX) > Math.abs(unitY)) {
            // Horizontal direction dominant
            targetX = targetCenter.x + (unitX > 0 ? -boxWidth/2 : boxWidth/2);
            targetY = targetCenter.y - (unitY * boxWidth/2 / Math.abs(unitX));
        } else {
            // Vertical direction dominant
            targetX = targetCenter.x - (unitX * boxHeight/2 / Math.abs(unitY));
            targetY = targetCenter.y + (unitY > 0 ? -boxHeight/2 : boxHeight/2);
        }
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'diagram-edge');
        line.setAttribute('data-edge-id', edge.id);
        line.setAttribute('x1', sourceX);
        line.setAttribute('y1', sourceY);
        line.setAttribute('x2', targetX);
        line.setAttribute('y2', targetY);
        line.setAttribute('stroke', '#666');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('marker-end', 'url(#arrow)');
        line.style.cursor = 'pointer';
        
        line.addEventListener('click', (e) => {
            e.stopPropagation();
            selectEdge(edge.id);
        });
        
        // Add edge label if trigger exists
        if (edge.data?.trigger && edge.data.trigger !== '') {
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;
            
            const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            labelGroup.setAttribute('class', 'edge-label');
            
            const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const triggerText = edge.data.trigger === 'NEXT' ? '' : edge.data.trigger;
            const textWidth = triggerText.length * 6 + 8;
            
            labelBg.setAttribute('x', midX - textWidth/2);
            labelBg.setAttribute('y', midY - 8);
            labelBg.setAttribute('width', textWidth);
            labelBg.setAttribute('height', 16);
            labelBg.setAttribute('rx', 3);
            labelBg.setAttribute('fill', 'var(--vscode-badge-background)');
            labelBg.setAttribute('stroke', 'var(--vscode-badge-foreground)');
            labelBg.setAttribute('stroke-width', '1');
            
            const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            labelText.setAttribute('x', midX);
            labelText.setAttribute('y', midY + 3);
            labelText.setAttribute('text-anchor', 'middle');
            labelText.setAttribute('font-size', '10');
            labelText.setAttribute('fill', 'var(--vscode-badge-foreground)');
            labelText.textContent = triggerText;
            
            if (triggerText) {
                labelGroup.appendChild(labelBg);
                labelGroup.appendChild(labelText);
                svg.appendChild(labelGroup);
            }
        }
        
        svg.appendChild(line);
    }

    function createNodeAtPosition(nodeType, x, y) {
        if (!currentState.activeFlow) {
            return;
        }
        
        const nodeId = `${nodeType}_${Date.now()}`;
        const newNode = {
            id: nodeId,
            type: nodeType,
            position: { x: x - 60, y: y - 20 }, // Center the node on the cursor
            data: {
                label: nodeId,
                messageData: nodeType === 'message' || nodeType === 'rich_card' ? { text: 'New message' } : null,
                rclMetadata: {
                    hasConditions: false,
                    hasSuggestions: false,
                    messageType: nodeType === 'message' ? 'text' : nodeType,
                    trafficType: 'TRANSACTION'
                }
            }
        };
        
        // Add node to current flow
        if (!currentState.flows[currentState.activeFlow]) {
            currentState.flows[currentState.activeFlow] = { id: currentState.activeFlow, nodes: [], edges: [] };
        }
        
        currentState.flows[currentState.activeFlow].nodes.push(newNode);
        
        // If it's a message node, create default message
        if (nodeType === 'message' || nodeType === 'rich_card') {
            if (!currentState.messages[nodeId]) {
                currentState.messages[nodeId] = {
                    contentMessage: {
                        text: nodeType === 'message' ? 'New message' : undefined,
                        richCard: nodeType === 'rich_card' ? {
                            standaloneCard: {
                                cardOrientation: 'VERTICAL',
                                cardContent: {
                                    title: 'New Rich Card',
                                    description: 'Card description'
                                }
                            }
                        } : undefined
                    },
                    messageTrafficType: 'TRANSACTION'
                };
            }
        }
        
        // Notify extension
        vscode.postMessage({
            type: 'nodeCreated',
            data: { flowId: currentState.activeFlow, node: newNode }
        });
        
        renderDiagram();
        
        // Auto-select the new node
        selectNode(nodeId);
    }

    function selectNode(nodeId) {
        currentState.selectedNodes = [nodeId];
        currentState.selectedEdges = [];
        
        // Update visual selection
        updateSelection();
        updatePropertiesPanel();
    }

    function selectEdge(edgeId) {
        currentState.selectedEdges = [edgeId];
        currentState.selectedNodes = [];
        
        // Update visual selection
        updateSelection();
        updatePropertiesPanel();
    }

    function updateSelection() {
        // Clear previous selection
        document.querySelectorAll('.diagram-node, .diagram-edge').forEach(element => {
            element.classList.remove('selected');
        });
        
        // Apply new selection
        currentState.selectedNodes.forEach(nodeId => {
            const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
            if (nodeElement) {
                nodeElement.classList.add('selected');
                nodeElement.querySelector('rect, ellipse').setAttribute('stroke', '#FFC107');
                nodeElement.querySelector('rect, ellipse').setAttribute('stroke-width', '3');
            }
        });
        
        currentState.selectedEdges.forEach(edgeId => {
            const edgeElement = document.querySelector(`[data-edge-id="${edgeId}"]`);
            if (edgeElement) {
                edgeElement.classList.add('selected');
                edgeElement.setAttribute('stroke', '#FFC107');
                edgeElement.setAttribute('stroke-width', '3');
            }
        });
    }

    function updatePropertiesPanel() {
        let content = '<p>Select a node to edit properties</p>';
        
        if (currentState.selectedNodes.length === 1) {
            const nodeId = currentState.selectedNodes[0];
            const flow = currentState.flows[currentState.activeFlow];
            const node = flow?.nodes.find(n => n.id === nodeId);
            
            if (node) {
                content = `
                    <div class="property-group">
                        <label class="property-label">Node ID:</label>
                        <input type="text" class="property-input" value="${node.id}" data-property="id">
                    </div>
                    <div class="property-group">
                        <label class="property-label">Type:</label>
                        <select class="property-input" data-property="type">
                            <option value="start" ${node.type === 'start' ? 'selected' : ''}>Start</option>
                            <option value="message" ${node.type === 'message' ? 'selected' : ''}>Message</option>
                            <option value="rich_card" ${node.type === 'rich_card' ? 'selected' : ''}>Rich Card</option>
                            <option value="end" ${node.type === 'end' ? 'selected' : ''}>End</option>
                        </select>
                    </div>
                `;
                
                if (node.type === 'message' || node.type === 'rich_card') {
                    content += `
                        <div class="property-group">
                            <label class="property-label">Message Text:</label>
                            <textarea class="property-input" rows="3" data-property="text">${node.data?.messageData?.text || ''}</textarea>
                        </div>
                    `;
                }
                
                content += `
                    <div class="property-group">
                        <button class="property-button" onclick="applyNodeProperties('${nodeId}')">Apply Changes</button>
                        <button class="property-button" onclick="deleteNode('${nodeId}')">Delete Node</button>
                    </div>
                `;
            }
        }
        
        elements.propertiesContent.innerHTML = content;
        
        // Add event listeners to property inputs
        elements.propertiesContent.querySelectorAll('.property-input').forEach(input => {
            input.addEventListener('change', () => {
                // Auto-apply changes on change
                if (currentState.selectedNodes.length === 1) {
                    window.applyNodeProperties(currentState.selectedNodes[0]);
                }
            });
        });
    }

    function setActiveFlow(flowId) {
        currentState.activeFlow = flowId;
        elements.flowSelect.value = flowId;
        clearSelection();
        renderDiagram();
        updatePropertiesPanel();
    }

    function toggleEditMode(mode) {
        if (currentState.editMode === mode) {
            currentState.editMode = 'select';
        } else {
            currentState.editMode = mode;
        }
        
        updateToolbarState();
    }

    function setEditMode(mode) {
        currentState.editMode = mode;
        updateToolbarState();
    }

    function updateToolbarState() {
        // Update toolbar button states
        elements.addNodeBtn.classList.toggle('active', currentState.editMode === 'add-node');
        elements.connectBtn.classList.toggle('active', currentState.editMode === 'connect');
        
        // Update cursor style
        elements.sprottyContainer.style.cursor = currentState.editMode === 'add-node' ? 'crosshair' : 'default';
    }

    function clearSelection() {
        currentState.selectedNodes = [];
        currentState.selectedEdges = [];
        updateSelection();
        updatePropertiesPanel();
    }

    function deleteSelection() {
        if (currentState.selectedNodes.length > 0 || currentState.selectedEdges.length > 0) {
            currentState.selectedNodes.forEach(nodeId => {
                deleteNode(nodeId);
            });
            
            currentState.selectedEdges.forEach(edgeId => {
                deleteEdge(edgeId);
            });
            
            clearSelection();
        }
    }

    function deleteNode(nodeId) {
        if (!currentState.activeFlow || !currentState.flows[currentState.activeFlow]) {
            return;
        }
        
        const flow = currentState.flows[currentState.activeFlow];
        
        // Remove node
        flow.nodes = flow.nodes.filter(node => node.id !== nodeId);
        
        // Remove connected edges
        flow.edges = flow.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId);
        
        // Notify extension
        vscode.postMessage({
            type: 'nodeDeleted',
            data: { flowId: currentState.activeFlow, nodeId }
        });
        
        renderDiagram();
        clearSelection();
    }

    function deleteEdge(edgeId) {
        if (!currentState.activeFlow || !currentState.flows[currentState.activeFlow]) {
            return;
        }
        
        const flow = currentState.flows[currentState.activeFlow];
        flow.edges = flow.edges.filter(edge => edge.id !== edgeId);
        
        // Notify extension
        vscode.postMessage({
            type: 'edgeDeleted',
            data: { flowId: currentState.activeFlow, edgeId }
        });
        
        renderDiagram();
        clearSelection();
    }

    function saveChanges() {
        vscode.postMessage({
            type: 'modelChanged',
            data: {
                flows: currentState.flows,
                activeFlow: currentState.activeFlow
            }
        });
    }

    function editNodeProperties(nodeId) {
        selectNode(nodeId);
        // Properties panel is automatically updated in selectNode
    }

    function startNodeDrag(nodeId, event) {
        // Basic node dragging implementation
        const node = currentState.flows[currentState.activeFlow]?.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        const startX = event.clientX - node.position.x;
        const startY = event.clientY - node.position.y;
        
        function onMouseMove(e) {
            node.position.x = e.clientX - startX;
            node.position.y = e.clientY - startY;
            renderDiagram();
        }
        
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // Notify extension of position change
            vscode.postMessage({
                type: 'nodeUpdated',
                data: { flowId: currentState.activeFlow, node }
            });
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    // Global functions for property panel
    window.applyNodeProperties = function(nodeId) {
        const flow = currentState.flows[currentState.activeFlow];
        const node = flow?.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        // Get property values from inputs
        const inputs = elements.propertiesContent.querySelectorAll('.property-input');
        inputs.forEach(input => {
            const property = input.dataset.property;
            const value = input.value;
            
            if (property === 'id') {
                node.id = value;
            } else if (property === 'type') {
                node.type = value;
            } else if (property === 'text') {
                if (!node.data) node.data = {};
                if (!node.data.messageData) node.data.messageData = {};
                node.data.messageData.text = value;
            }
        });
        
        // Notify extension
        vscode.postMessage({
            type: 'nodeUpdated',
            data: { flowId: currentState.activeFlow, node }
        });
        
        renderDiagram();
    };

    window.deleteNode = deleteNode;

    // Connection handling functions
    function handleConnectionClick(nodeId) {
        if (!currentState.connectionStart) {
            // Start connection
            currentState.connectionStart = nodeId;
            highlightNode(nodeId, 'connection-start');
        } else if (currentState.connectionStart === nodeId) {
            // Cancel connection
            clearConnectionHighlights();
            currentState.connectionStart = null;
        } else {
            // Complete connection
            createConnection(currentState.connectionStart, nodeId);
            clearConnectionHighlights();
            currentState.connectionStart = null;
        }
    }

    function createConnection(sourceId, targetId) {
        if (!currentState.activeFlow || !currentState.flows[currentState.activeFlow]) {
            return;
        }
        
        const flow = currentState.flows[currentState.activeFlow];
        const edgeId = `${sourceId}-${targetId}-${Date.now()}`;
        
        // Check if connection already exists
        const existingEdge = flow.edges.find(edge => 
            edge.source === sourceId && edge.target === targetId
        );
        
        if (existingEdge) {
            console.log('Connection already exists');
            return;
        }
        
        const newEdge = {
            id: edgeId,
            source: sourceId,
            target: targetId,
            data: {
                trigger: 'NEXT'
            }
        };
        
        flow.edges.push(newEdge);
        
        // Notify extension
        vscode.postMessage({
            type: 'edgeCreated',
            data: { flowId: currentState.activeFlow, edge: newEdge }
        });
        
        renderDiagram();
    }

    function highlightNode(nodeId, className) {
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (nodeElement) {
            nodeElement.classList.add(className);
            const shape = nodeElement.querySelector('rect, ellipse');
            if (shape) {
                shape.setAttribute('stroke', '#00ff00');
                shape.setAttribute('stroke-width', '3');
            }
        }
    }

    function clearConnectionHighlights() {
        document.querySelectorAll('.connection-start').forEach(element => {
            element.classList.remove('connection-start');
            const shape = element.querySelector('rect, ellipse');
            if (shape) {
                shape.setAttribute('stroke', '#333');
                shape.setAttribute('stroke-width', '2');
            }
        });
    }

    // RCL Validation functions
    function validateRCLModel() {
        const errors = [];
        const warnings = [];
        
        if (!currentState.activeFlow || !currentState.flows[currentState.activeFlow]) {
            errors.push('No active flow selected');
            return { errors, warnings };
        }
        
        const flow = currentState.flows[currentState.activeFlow];
        
        // Check for orphaned nodes (no incoming or outgoing edges)
        flow.nodes.forEach(node => {
            const hasIncoming = flow.edges.some(edge => edge.target === node.id);
            const hasOutgoing = flow.edges.some(edge => edge.source === node.id);
            
            if (!hasIncoming && !hasOutgoing && node.type !== 'start' && node.type !== 'end') {
                warnings.push(`Node '${node.id}' has no connections`);
            }
        });
        
        // Check for missing start/end nodes
        const hasStart = flow.nodes.some(node => node.type === 'start');
        const hasEnd = flow.nodes.some(node => node.type === 'end');
        
        if (!hasStart) {
            errors.push('Flow must have a start node');
        }
        if (!hasEnd) {
            warnings.push('Flow should have an end node');
        }
        
        // Check for invalid message references
        flow.nodes.forEach(node => {
            if ((node.type === 'message' || node.type === 'rich_card') && node.id) {
                if (!currentState.messages[node.id]) {
                    warnings.push(`Node '${node.id}' references missing message`);
                }
            }
        });
        
        return { errors, warnings };
    }

    function showValidationResults() {
        const validation = validateRCLModel();
        
        if (validation.errors.length === 0 && validation.warnings.length === 0) {
            showNotification('Model is valid', 'success');
            return;
        }
        
        let message = '';
        if (validation.errors.length > 0) {
            message += 'Errors:\n' + validation.errors.join('\n') + '\n';
        }
        if (validation.warnings.length > 0) {
            message += 'Warnings:\n' + validation.warnings.join('\n');
        }
        
        showNotification(message, validation.errors.length > 0 ? 'error' : 'warning');
    }

    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        // Add close button handler
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    // Enhanced property panel functions
    window.validateModel = function() {
        showValidationResults();
    };

    window.autoLayout = function() {
        if (!currentState.activeFlow || !currentState.flows[currentState.activeFlow]) {
            return;
        }
        
        const flow = currentState.flows[currentState.activeFlow];
        
        // Simple hierarchical layout
        const startNodes = flow.nodes.filter(node => node.type === 'start');
        if (startNodes.length === 0) {
            showNotification('No start node found for auto-layout', 'warning');
            return;
        }
        
        // Build dependency graph
        const visited = new Set();
        const levels = [];
        
        function traverse(nodeId, level) {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);
            
            if (!levels[level]) levels[level] = [];
            levels[level].push(nodeId);
            
            // Find outgoing edges
            const outgoingEdges = flow.edges.filter(edge => edge.source === nodeId);
            outgoingEdges.forEach(edge => {
                traverse(edge.target, level + 1);
            });
        }
        
        // Start traversal from start nodes
        startNodes.forEach(startNode => {
            traverse(startNode.id, 0);
        });
        
        // Position nodes
        const xSpacing = 200;
        const ySpacing = 100;
        const startX = 100;
        const startY = 100;
        
        levels.forEach((level, levelIndex) => {
            level.forEach((nodeId, nodeIndex) => {
                const node = flow.nodes.find(n => n.id === nodeId);
                if (node) {
                    node.position.x = startX + (levelIndex * xSpacing);
                    node.position.y = startY + (nodeIndex * ySpacing) - ((level.length - 1) * ySpacing / 2);
                }
            });
        });
        
        renderDiagram();
        showNotification('Auto-layout applied', 'success');
    };

    window.exportDiagram = function() {
        const diagramData = {
            flows: currentState.flows,
            messages: currentState.messages,
            agent: currentState.agent,
            timestamp: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(diagramData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `rcl-diagram-${Date.now()}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        showNotification('Diagram exported', 'success');
    };

    // Expose global functions for debugging
    window.rclInteractiveDiagram = {
        getCurrentState: () => currentState,
        setActiveFlow: setActiveFlow,
        clearSelection: clearSelection,
        saveChanges: saveChanges,
        validateModel: validateRCLModel,
        autoLayout: window.autoLayout,
        exportDiagram: window.exportDiagram
    };
})();
// Inline text editing function - Added via patch
function editNodeInline(nodeId, textElement) {
    const vscode = acquireVsCodeApi();
    const flow = window.rclInteractiveDiagram?.getCurrentState()?.flows?.[window.rclInteractiveDiagram?.getCurrentState()?.activeFlow];
    const node = flow?.nodes.find(n => n.id === nodeId);
    if (\!node || \!textElement) return;

    // Create input element for inline editing
    const input = document.createElement('input');
    input.type = 'text';
    input.value = textElement.textContent;
    input.style.position = 'absolute';
    input.style.left = (node.position.x + 10) + 'px';
    input.style.top = (node.position.y + 15) + 'px';
    input.style.width = '100px';
    input.style.fontSize = '12px';
    input.style.fontFamily = 'var(--vscode-font-family)';
    input.style.background = 'var(--vscode-input-background)';
    input.style.color = 'var(--vscode-foreground)';
    input.style.border = '1px solid var(--vscode-input-border)';
    input.style.zIndex = '1000';

    // Add input to container
    const container = document.getElementById('sprotty-container');
    container.appendChild(input);
    input.focus();
    input.select();

    function finishEdit() {
        const newText = input.value.trim();
        if (newText && newText \!== textElement.textContent) {
            // Update node data
            if (node.type === 'message' || node.type === 'rich_card') {
                if (\!node.data) node.data = {};
                if (\!node.data.messageData) node.data.messageData = {};
                node.data.messageData.text = newText;
            } else {
                if (\!node.data) node.data = {};
                node.data.label = newText;
            }

            // Update visual text
            textElement.textContent = newText;

            // Notify extension of change
            vscode.postMessage({
                type: 'nodeUpdated',
                data: { flowId: window.rclInteractiveDiagram?.getCurrentState()?.activeFlow, node }
            });
        }
        
        // Remove input element
        if (input.parentNode) {
            input.parentNode.removeChild(input);
        }
    }

    // Handle input events
    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (input.parentNode) {
                input.parentNode.removeChild(input);
            }
        }
    });
}

// Make function globally accessible
window.editNodeInline = editNodeInline;

