import { logger } from '../utils/logger.js';
import { CHAIN_CONFIG } from '../utils/constant.js';
export class RouteOptimizer {
    graph = new Map();
    edges = [];
    async findOptimalRoutes(sourceChain, targetChains, amount, riskTolerance, poolsByChain) {
        logger.info(`🔍 Finding optimal routes for ${amount} USD from ${sourceChain}`);
        // Build the investment graph
        this.buildInvestmentGraph(poolsByChain);
        // Find routes using BFS
        const routes = await this.bfsRouteSearch(sourceChain, targetChains, amount);
        // Score and rank routes
        const rankedRoutes = this.scoreRoutes(routes, riskTolerance, amount);
        logger.info(`✅ Found ${rankedRoutes.length} optimal routes`);
        return rankedRoutes.slice(0, 10); // Top 10 routes
    }
    buildInvestmentGraph(poolsByChain) {
        this.graph.clear();
        this.edges = [];
        // Create nodes for each pool
        for (const [chain, pools] of Object.entries(poolsByChain)) {
            const nodes = pools.map(pool => ({
                chain,
                protocol: pool.project,
                pool,
                cost: this.estimateTransactionCost(pool, chain),
                risk: pool.riskScore,
                apy: pool.apy
            }));
            this.graph.set(chain, nodes);
        }
        // Create edges (connections between chains)
        for (const [fromChain, fromNodes] of this.graph.entries()) {
            for (const [toChain, toNodes] of this.graph.entries()) {
                if (fromChain !== toChain) {
                    this.createCrossChainEdges(fromChain, toChain, fromNodes, toNodes);
                }
            }
        }
        const totalNodes = Array.from(this.graph.values()).reduce((sum, nodes) => sum + nodes.length, 0);
        logger.info(`📊 Built graph: ${totalNodes} nodes, ${this.edges.length} edges`);
    }
    async bfsRouteSearch(sourceChain, targetChains, amount) {
        const routes = [];
        const visited = new Set();
        const queue = [];
        // Initialize BFS with source chain pools
        const sourceNodes = this.graph.get(sourceChain) || [];
        for (const node of sourceNodes) {
            queue.push({
                chain: sourceChain,
                path: [node],
                totalCost: node.cost,
                totalRisk: node.risk,
                totalReturn: amount * (node.apy / 100),
                depth: 1
            });
        }
        // BFS traversal
        while (queue.length > 0) {
            const current = queue.shift();
            // Limit search depth
            if (current.depth > 3)
                continue;
            // Check if already visited
            const pathKey = current.path.map(n => `${n.chain}-${n.protocol}`).join('-');
            if (visited.has(pathKey))
                continue;
            visited.add(pathKey);
            // If on target chain, add as potential route
            if (targetChains.includes(current.chain)) {
                routes.push({
                    path: current.path,
                    totalCost: current.totalCost,
                    totalRisk: current.totalRisk / current.path.length,
                    expectedReturn: current.totalReturn,
                    estimatedAPY: (current.totalReturn / amount) * 100,
                    bridgeSteps: current.depth - 1,
                    estimatedTime: this.calculateRouteTime(current.path)
                });
            }
            // Continue BFS to other chains
            this.expandBFSPath(current, queue, amount);
        }
        logger.info(`🔍 BFS discovered ${routes.length} potential routes`);
        return routes;
    }
    expandBFSPath(current, queue, amount) {
        const lastNode = current.path[current.path.length - 1];
        for (const edge of this.edges) {
            if (this.edgeMatches(edge.from, lastNode)) {
                const newCost = current.totalCost + edge.bridgeCost + edge.to.cost;
                const newRisk = current.totalRisk + edge.to.risk;
                const newReturn = current.totalReturn + (amount * (edge.to.apy / 100));
                // Only continue if costs are reasonable
                if (newCost < amount * 0.15) { // Max 15% in costs
                    queue.push({
                        chain: edge.to.chain,
                        path: [...current.path, edge.to],
                        totalCost: newCost,
                        totalRisk: newRisk,
                        totalReturn: newReturn,
                        depth: current.depth + 1
                    });
                }
            }
        }
    }
    scoreRoutes(routes, riskTolerance, amount) {
        const weights = {
            LOW: { return: 0.3, risk: 0.5, cost: 0.2 },
            MEDIUM: { return: 0.5, risk: 0.3, cost: 0.2 },
            HIGH: { return: 0.6, risk: 0.2, cost: 0.2 }
        };
        const w = weights[riskTolerance];
        return routes
            .map(route => {
            // Normalize metrics (0-1 scale)
            const normalizedReturn = Math.min(route.estimatedAPY / 50, 1);
            const normalizedRisk = 1 - (route.totalRisk / 100);
            const normalizedCost = 1 - (route.totalCost / (amount * 0.1));
            // Calculate weighted score
            const score = (w.return * normalizedReturn +
                w.risk * normalizedRisk +
                w.cost * normalizedCost);
            return { ...route, score };
        })
            .sort((a, b) => b.score - a.score);
    }
    createCrossChainEdges(fromChain, toChain, fromNodes, toNodes) {
        const bridgeCost = this.calculateBridgeCost(fromChain, toChain);
        const gasEstimate = CHAIN_CONFIG[toChain]?.bridgeCost || 30;
        const timeEstimate = this.estimateBridgeTime(fromChain, toChain);
        // Create edges between compatible protocols only
        for (const fromNode of fromNodes) {
            for (const toNode of toNodes) {
                this.edges.push({
                    from: fromNode,
                    to: toNode,
                    bridgeCost,
                    gasEstimate,
                    timeEstimate
                });
            }
        }
    }
    estimateTransactionCost(pool, chain) {
        const gasPrice = CHAIN_CONFIG[chain]?.bridgeCost || 20;
        return gasPrice * 0.001; // Rough estimate
    }
    calculateBridgeCost(fromChain, toChain) {
        const bridgeCosts = {
            avalanche: { base: 25 },
            base: { avalanche: 30 }
        };
        return bridgeCosts[fromChain]?.[toChain] || 50;
    }
    estimateBridgeTime(fromChain, toChain) {
        const bridgeTimes = {
            avalanche: { base: 10 },
            base: { avalanche: 15 }
        };
        return bridgeTimes[fromChain]?.[toChain] || 30;
    }
    calculateRouteTime(path) {
        if (path.length === 1)
            return 2;
        let totalTime = 0;
        for (let i = 0; i < path.length - 1; i++) {
            totalTime += this.estimateBridgeTime(path[i].chain, path[i + 1].chain);
        }
        return totalTime;
    }
    edgeMatches(edgeFrom, pathNode) {
        return edgeFrom.chain === pathNode.chain &&
            edgeFrom.protocol === pathNode.protocol;
    }
}
//# sourceMappingURL=route-optimizer.js.map